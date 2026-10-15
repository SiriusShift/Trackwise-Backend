import moment from "moment-timezone"; // NOTE: must be moment-timezone — plain "moment" has no .tz()
import cron from "node-cron";
import { getAssetBalance } from "../services/assets.service.js";
import { syncCreditStatements } from "../services/schedules.service.js";
import { sendNotificationEmail } from "../services/email.service.js";

import { prisma } from "../config/prisma.js";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

// NOTE: Next due date is computed from startDate + k * interval instead of
// "previous due + interval". Chaining month additions drifts at month end
// (Jan 31 -> Feb 28 -> Mar 28). Anchoring on startDate gives Jan 31 -> Feb 28 -> Mar 31.
const computeNextDue = (item, currentDueLocal, timezone) => {
  const anchor = moment.tz(item.startDate, timezone).startOf("day");
  let k = 1;
  let next = anchor.clone().add(k * item.interval, item.unit);
  while (!next.isAfter(currentDueLocal)) {
    k++;
    next = anchor.clone().add(k * item.interval, item.unit);
  }
  return next;
};

// Per-type Prisma delegate name + the RecurringLog column that stores the generated id.
const TYPE_CONFIG = {
  Expense: { delegate: "expense", logKey: "generatedExpenseId" },
  Income: { delegate: "income", logKey: "generatedIncomeId" },
  Transfer: { delegate: "transfer", logKey: "generatedTransferId" },
};

/*
|--------------------------------------------------------------------------
| Recurring transactions job (hourly)
|--------------------------------------------------------------------------
| Hourly (not daily) so every user's local midnight is picked up regardless of
| timezone. The RecurringLog dedup guard makes repeated runs safe.
*/
cron.schedule("0 * * * *", async () => {
  console.log("⏰ Running recurring transactions...");

  // NOTE: top-level guard so an unexpected error never becomes an unhandled rejection.
  try {
    const users = await prisma.settings.findMany({
      select: {
        userId: true,
        timezone: true,
        emailNotification: true,
        notifyDays: true,
        user: { select: { email: true } },
      },
    });

    for (const { userId, timezone: tz, emailNotification, notifyDays, user } of users) {
      // NOTE: email is a best-effort extra on top of the in-app notification; it never blocks the run.
      const emailUser = (title, message) => {
        if (emailNotification && user?.email) sendNotificationEmail(user.email, { title, message });
      };

      // NOTE: a destructuring default only covers `undefined`; a DB null/"" would break moment.tz.
      const timezone = tz || "UTC";
      const todayLocal = moment().tz(timezone).startOf("day");

      // Close credit card cycles into statements so they show up as scheduled bills.
      try {
        await syncCreditStatements(userId, timezone);
      } catch (err) {
        console.error(`❌ Failed syncing credit statements for user ${userId}:`, err);
      }

      let recurringList;
      try {
        recurringList = await prisma.recurringTransaction.findMany({
          where: {
            isActive: true,
            userId,
            status: "ACTIVE",
            // NOTE: only fetch items that can possibly be due (+1 day buffer for timezones);
            // the exact local-day check happens below.
            // Widened by notifyDays so advance reminders can be sent.
            nextDueDate: { lte: moment().add(1 + Math.max(notifyDays ?? 0, 0), "day").toDate() },
          },
        });
      } catch (err) {
        console.error(`❌ Failed loading recurring items for user ${userId}:`, err);
        continue;
      }

      for (const item of recurringList) {
        try {
          const nextDueLocal = moment(item.nextDueDate).tz(timezone).startOf("day");
          if (todayLocal.isBefore(nextDueLocal)) {
            /* ---------------- UPCOMING (advance reminder) ---------------- */
            const daysUntil = nextDueLocal.diff(todayLocal, "days");
            if (notifyDays > 0 && daysUntil <= notifyDays) {
              const dueLabel = nextDueLocal.format("MMM D, YYYY");
              const message = `${item.description} is due on ${dueLabel}.`;
              // Dedup: one advance reminder per schedule per due date (message embeds the date).
              const alreadySent = await prisma.notification.findFirst({
                where: { userId, recurringId: item.id, title: "Upcoming bill", message },
                select: { id: true },
              });
              if (!alreadySent) {
                await prisma.notification.create({
                  data: { userId, recurringId: item.id, title: "Upcoming bill", message, type: "Reminder" },
                });
                emailUser("Upcoming bill", message);
              }
            }
            continue;
          }

          // NOTE: respect endDate. Past it, close the schedule instead of firing again.
          if (item.endDate && nextDueLocal.isAfter(moment(item.endDate).tz(timezone).endOf("day"))) {
            await prisma.recurringTransaction.update({
              where: { id: item.id },
              data: { status: "ENDED", isActive: false },
            });
            continue;
          }

          const firedAt = nextDueLocal.toDate();

          // Dedup guard: only a cycle that was actually handled counts as "already fired".
          // NOTE: FAILED is intentionally NOT counted, so AUTO_LOG retries every hour until the
          // balance is topped up (before, a FAILED log blocked the item forever).
          const existingLog = await prisma.recurringLog.findUnique({
            where: { recurringId_firedAt: { recurringId: item.id, firedAt } },
          });
          if (existingLog && existingLog.result !== "FAILED") continue;

          /* ---------------- REMIND ---------------- */
          if (item.behaviour === "REMIND") {
            // Notify only. Do NOT create a transaction and do NOT advance nextDueDate;
            // that happens when the user pays it (transactBill).
            // NOTE: notification + log are one atomic write so a failure can't cause duplicate reminders.
            await prisma.$transaction([
              prisma.notification.create({
                data: {
                  userId,
                  recurringId: item.id,
                  title: "Bill due",
                  message: `${item.description} is due today.`,
                  type: "Reminder",
                },
              }),
              prisma.recurringLog.upsert({
                where: { recurringId_firedAt: { recurringId: item.id, firedAt } },
                create: { recurringId: item.id, firedAt, result: "REMINDED" },
                update: { result: "REMINDED", errorMessage: null },
              }),
            ]);
            emailUser("Bill due", `${item.description} is due today.`);
            continue;
          }

          /* ---------------- AUTO_LOG ---------------- */
          const config = TYPE_CONFIG[item.type];
          if (!config) continue;

          // Balance check (Expense/Transfer only)
          if ((item.type === "Expense" || item.type === "Transfer") && item.fromAssetId) {
            const result = await getAssetBalance(userId, item.fromAssetId);
            const asset = result?.data?.[0];

            // Credit accounts are limited by available credit, not by their owed balance.
            const available = asset?.category === "CREDIT" ? asset.remainingCredit : asset?.remainingBalance;

            if (!asset || Number(available) < Number(item.amount)) {
              const errorMessage =
                asset?.category === "CREDIT"
                  ? `Credit limit exceeded on ${asset.name}`
                  : `Insufficient balance in ${asset?.name ?? "linked account"}`;

              // NOTE: upsert (RecurringLog is unique on [recurringId, firedAt]) so hourly retries
              // update the same row instead of throwing a unique-constraint error.
              await prisma.recurringLog.upsert({
                where: { recurringId_firedAt: { recurringId: item.id, firedAt } },
                create: { recurringId: item.id, firedAt, result: "FAILED", errorMessage },
                update: { result: "FAILED", errorMessage },
              });

              // NOTE: tell the user, but only on the first failure of this cycle (not every hour).
              if (!existingLog) {
                const failMessage = `${item.description} could not be logged: ${errorMessage}. It will retry automatically.`;
                await prisma.notification.create({
                  data: {
                    userId,
                    recurringId: item.id,
                    title: "Recurring transaction failed",
                    message: failMessage,
                    type: "Error",
                  },
                });
                emailUser("Recurring transaction failed", failMessage);
              }
              continue;
            }
          }

          const transactionData = {
            amount: item.amount,
            // NOTE: use the due date (not today) so catch-up runs after downtime land on the right day.
            date: firedAt,
            description: item.description,
            status: "Completed",
            isActive: true,
            recurringId: item.id,
            categoryId: item.categoryId,
            recurringDueDate: firedAt,
            userId,
            ...(item.type === "Expense" && { assetId: item.fromAssetId }),
            // Income stores its account in fromAssetId now; older rows used toAssetId.
            ...(item.type === "Income" && { assetId: item.fromAssetId ?? item.toAssetId }),
            ...(item.type === "Transfer" && {
              fromAssetId: item.fromAssetId,
              toAssetId: item.toAssetId,
            }),
          };

          const newNextDue = computeNextDue(item, nextDueLocal, timezone).toDate();

          // NOTE: one missed cycle is processed per item per hourly run; after downtime the
          // backlog catches up one cycle per hour.
          const newTransaction = await prisma.$transaction(async (tx) => {
            const created = await tx[config.delegate].create({ data: transactionData });

            await tx.recurringTransaction.update({
              where: { id: item.id },
              data: { nextDueDate: newNextDue, lastTriggeredAt: new Date() },
            });

            // Upsert: overwrites an earlier FAILED log for the same cycle.
            await tx.recurringLog.upsert({
              where: { recurringId_firedAt: { recurringId: item.id, firedAt } },
              create: {
                recurringId: item.id,
                firedAt,
                result: "CREATED",
                [config.logKey]: created.id,
              },
              update: {
                result: "CREATED",
                errorMessage: null,
                [config.logKey]: created.id,
              },
            });

            return created;
          });

          console.log(`✅ Created ${item.type} ID ${newTransaction.id} for user ${userId}`);
        } catch (err) {
          // One failing item shouldn't stop the rest of the run.
          console.error(`❌ Failed processing recurring item ${item.id} for user ${userId}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("❌ Recurring cron crashed:", err);
  }

  console.log("✅ Recurring transactions completed");
});

/* ----------------------------------------
   🛑 GRACEFUL SHUTDOWN
----------------------------------------- */
process.on("SIGINT", async () => {
  console.log("🛑 Shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🛑 Shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});

console.log("✅ Cron jobs initialized");
