import { PrismaClient } from "@prisma/client";
import moment from "moment";
import momentTz from "moment-timezone";
import cron from "node-cron";

const prisma = new PrismaClient();

/* -------------------------------
   1️⃣ OVERDUE CHECK (DAILY 12AM)
-------------------------------- */
cron.schedule("0 0 * * *", async () => {
  const today = moment().startOf("day");

  console.log("🔍 Running overdue check...");

  const models = [
    { name: "expense", model: prisma.expense },
    { name: "income", model: prisma.income },
    { name: "transfer", model: prisma.transfer },
  ];

  try {
    for (const { name, model } of models) {
      const pendingItems = await model.findMany({
        where: {
          recurringId: { not: null },
          isActive: true,
          status: "Pending",
        },
      });

      for (const item of pendingItems) {
        const dueDate = moment(item.date).startOf("day");

        if (dueDate.isBefore(today)) {
          await model.update({
            where: { id: item.id },
            data: { status: "Overdue" },
          });

          console.log(`✅ ${name} ${item.id} marked Overdue`);
        }
      }
    }

    console.log("✅ Overdue check completed");
  } catch (err) {
    console.error("❌ Overdue cron error:", err);
  }
});

/* ----------------------------------------
   2️⃣ RECURRING TRANSACTIONS (HOURLY)
----------------------------------------- */
cron.schedule("0 * * * *", async () => {
  console.log("⏰ Running recurring transactions...");

  try {
    const users = await prisma.settings.findMany({
      select: { userId: true, timezone: true },
    });

    const modelMap = {
      Expense: prisma.expense,
      Income: prisma.income,
      Transfer: prisma.transfer,
    };

    for (const { userId, timezone = "UTC" } of users) {
      const todayLocal = moment().tz(timezone).startOf("day");

      const recurringList = await prisma.recurringTransaction.findMany({
        where: { isActive: true, userId },
      });

      for (const item of recurringList) {
        const model = modelMap[item.type];

        if (!model) continue;

        const nextDueLocal = moment(item.nextDueDate)
          .tz(timezone)
          .startOf("day");

        if (todayLocal.isSameOrAfter(nextDueLocal)) {
          const newTransaction = await model.create({
            data: {
              amount: item.amount,
              date: todayLocal.toDate(),
              description: item.description,
              status: "Pending",
              isActive: true,

              recurringTransaction: {
                connect: { id: item.id },
              },

              category: {
                connect: { id: item.categoryId },
              },

              user: {
                connect: { id: userId },
              },
            },
          });

          console.log(
            `✅ Created ${item.type} ID ${newTransaction.id} for user ${userId}`
          );

          const newNextDue = moment(nextDueLocal)
            .add(item.interval, item.unit)
            .startOf("day")
            .utc()
            .toDate();

          await prisma.recurringTransaction.update({
            where: { id: item.id },
            data: { nextDueDate: newNextDue },
          });
        }
      }
    }

    console.log("✅ Recurring transactions completed");
  } catch (err) {
    console.error("❌ Recurring cron error:", err);
  }
});

/* ----------------------------------------
   3️⃣ PAYMENT REMINDERS (DAILY 12AM)
----------------------------------------- */
cron.schedule("0 0 * * *", async () => {
  console.log("📧 Running payment reminders...");

  const twoDaysFromNow = moment().add(2, "days").startOf("day");

  const models = [
    { name: "expense", model: prisma.expense },
    { name: "income", model: prisma.income },
    { name: "transfer", model: prisma.transfer },
  ];

  try {
    for (const { name, model } of models) {
      const upcomingItems = await model.findMany({
        where: {
          isActive: true,
          status: "Pending",
          date: {
            gte: twoDaysFromNow.toDate(),
            lt: moment(twoDaysFromNow).add(1, "day").toDate(),
          },
        },
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
          category: {
            select: { name: true },
          },
        },
      });

      for (const item of upcomingItems) {
        console.log(`📬 Reminder (${name}) ID ${item.id}`);
        console.log(`   Email: ${item.user.email}`);
        console.log(`   Amount: ${item.amount}`);
        console.log(`   Category: ${item.category?.name ?? "N/A"}`);
      }
    }

    console.log("✅ Reminders completed");
  } catch (err) {
    console.error("❌ Reminder cron error:", err);
  }
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