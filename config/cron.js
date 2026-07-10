import { PrismaClient } from "@prisma/client";
import moment from "moment";
import cron from "node-cron";
import { getAssetBalance } from "../services/assets.service.js";

const prisma = new PrismaClient();


cron.schedule("0 * * * *", async () => { // hourly — see reasoning below
  console.log("⏰ Running recurring transactions...");

  const users = await prisma.settings.findMany({
    select: { userId: true, timezone: true },
  });

  for (const { userId, timezone = "UTC" } of users) {
    const todayLocal = moment().tz(timezone).startOf("day");

    const recurringList = await prisma.recurringTransaction.findMany({
      where: { isActive: true, userId, status: "ACTIVE" },
    });

    for (const item of recurringList) {
      try {
        const nextDueLocal = moment(item.nextDueDate).tz(timezone).startOf("day");
        if (!todayLocal.isSameOrAfter(nextDueLocal)) continue;

        // Dedup guard: has this cycle already been logged?
        const alreadyFired = await prisma.recurringLog.findUnique({
          where: {
            recurringId_firedAt: {
              recurringId: item.id,
              firedAt: nextDueLocal.toDate(),
            },
          },
        }).catch(() => null);
        if (alreadyFired) continue;

        if (item.behaviour === "REMIND") {
          // Just notify — do NOT create an Expense, do NOT advance nextDueDate.
          await prisma.notification.create({
            data: {
              userId,
              recurringId: item.id,
              title: "Bill due",
              message: `${item.description} is due today.`,
              type: "Reminder",
            },
          });
          await prisma.recurringLog.create({
            data: {
              recurringId: item.id,
              result: "REMINDED",
              firedAt: nextDueLocal.toDate(),
            },
          });
          continue;
        }

        // AUTO_LOG: check balance before creating
        const model = { Expense: prisma.expense, Income: prisma.income, Transfer: prisma.transfer }[item.type];
        if (!model) continue;

        if (item.type === "Expense" && item.fromAssetId) {
          const result = await getAssetBalance(userId, item.fromAssetId);
          const asset = result?.data?.[0];
          if (!asset || Number(result.remainingBalance) < Number(item.amount)) {
            await prisma.recurringLog.create({
              data: {
                recurringId: item.id,
                result: "FAILED",
                firedAt: nextDueLocal.toDate(),
                errorMessage: `Insufficient balance in ${asset?.name ?? "linked account"}`,
              },
            });
            continue; // nextDueDate NOT advanced — stays "due" until resolved
          }
        }

        const newTransaction = await model.create({
          data: {
            amount: item.amount,
            date: todayLocal.toDate(),
            description: item.description,
            status: "Completed",
            isActive: true,
            recurringId: item.id,
            categoryId: item.categoryId,
            assetId: item.fromAssetId,
            recurringDueDate: nextDueLocal.toDate(),
            userId,
          },
        });

        const newNextDue = moment(nextDueLocal).add(item.interval, item.unit).startOf("day").utc().toDate();

        await prisma.$transaction([
          prisma.recurringTransaction.update({
            where: { id: item.id },
            data: { nextDueDate: newNextDue, lastTriggeredAt: new Date() },
          }),
          prisma.recurringLog.create({
            data: {
              recurringId: item.id,
              result: "CREATED",
              firedAt: nextDueLocal.toDate(),
              generatedExpenseId: item.type === "Expense" ? newTransaction.id : undefined,
            },
          }),
        ]);

        console.log(`✅ Created ${item.type} ID ${newTransaction.id} for user ${userId}`);
      } catch (err) {
        console.error(`❌ Failed processing recurring item ${item.id} for user ${userId}:`, err);
        // continue to next item — one failure shouldn't kill the whole run
      }
    }
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