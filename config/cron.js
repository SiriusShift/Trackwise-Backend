import moment from "moment-timezone"; // NOTE: must be moment-timezone — plain "moment" has no .tz()
import cron from "node-cron";
import { getAssetBalance } from "../services/assets.service.js";

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
      select: { userId: true, timezone: true },
    });

    for (const { userId, timezone: tz } of users) {
      // NOTE: a destructuring default only covers `undefined`; a DB null/"" would break moment.tz.
      const timezone = tz || "UTC";
      const todayLocal = moment().tz(timezone).startOf("day");

      let recurringList;
      try {
        recurringList = await prisma.recurringTransaction.findMany({
          where: {
            isActive: true,
            userId,
            status: "ACTIVE",
            // NOTE: only fetch items that can possibly be due (+1 day buffer for timezones);
            // the exact local-day check happens below.
            nextDueDate: { lte: moment().add(1, "day").toDate() },
          },
        });
      } catch (err) {
        console.error(`❌ Failed loading recurring items for user ${userId}:`, err);
        continue;
      }

      for (const item of recurringList) {
        try {
          const nextDueLocal = moment(item.nextDueDate).tz(timezone).startOf("day");
          if (todayLocal.isBefore(nextDueLocal)) continue;

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
            continue;
          }

          /* ---------------- AUTO_LOG ---------------- */
          const config = TYPE_CONFIG[item.type];
          if (!config) continue;

          // Balance check (Expense/Transfer only)
          if ((item.type === "Expense" || item.type === "Transfer") && item.fromAssetId) {
            const result = await getAssetBalance(userId, item.fromAssetId);
            const asset = result?.data?.[0];

            if (!asset || Number(asset.remainingBalance) < Number(item.amount)) {
              const errorMessage = `Insufficient balance in ${asset?.name ?? "linked account"}`;

              // NOTE: upsert (RecurringLog is unique on [recurringId, firedAt]) so hourly retries
              // update the same row instead of throwing a unique-constraint error.
              await prisma.recurringLog.upsert({
                where: { recurringId_firedAt: { recurringId: item.id, firedAt } },
                create: { recurringId: item.id, firedAt, result: "FAILED", errorMessage },
                update: { result: "FAILED", errorMessage },
              });

              // NOTE: tell the user, but only on the first failure of this cycle (not every hour).
              if (!existingLog) {
                await prisma.notification.create({
                  data: {
                    userId,
                    recurringId: item.id,
                    title: "Recurring transaction failed",
                    message: `${item.description} could not be logged: ${errorMessage}. It will retry automatically.`,
                    type: "Error",
                  },
                });
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
            ...(item.type === "Income" && { assetId: item.toAssetId }),
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
