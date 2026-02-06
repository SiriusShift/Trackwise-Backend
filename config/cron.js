const { PrismaClient } = require("@prisma/client");
const momentTz = require("moment-timezone");
const moment = require("moment");
const cron = require("node-cron");

const prisma = new PrismaClient();

// 1️⃣ Check for overdue transactions - Run every day at 12 AM
cron.schedule("0 0 * * *", async () => {
  const today = moment().startOf("day");
  console.log("🔍 Running overdue check for expenses, income, and transfers...");

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
          console.log(`✅ Updated ${name} ${item.id} to Overdue`);
        }
      }
    }
    console.log("✅ Overdue check completed");
  } catch (err) {
    console.error("❌ Error processing overdue records:", err);
  }
});

// 2️⃣ Create recurring transactions - Run every hour
cron.schedule("0 * * * *", async () => {
  console.log("⏰ Running timezone-aware recurring transaction cron...");

  try {
    // Fetch all active users and their timezones
    const users = await prisma.settings.findMany({
      select: { userId: true, timezone: true },
    });

    for (const userSetting of users) {
      const timezone = userSetting.timezone || "UTC";

      // Current date in user's timezone
      const todayLocal = moment().tz(timezone).startOf("day");

      // Fetch all active recurring transactions for this user
      const recurringList = await prisma.recurringTransaction.findMany({
        where: { isActive: true, userId: userSetting.userId },
      });

      for (const item of recurringList) {
        // Convert nextDueDate to user's local timezone
        const nextDueLocal = moment(item.nextDueDate)
          .tz(timezone)
          .startOf("day");

        // Trigger if today is >= nextDueDate
        if (todayLocal.isSameOrAfter(nextDueLocal)) {
          // Map type to Prisma model
          const models = {
            Expense: prisma.expense,
            Income: prisma.income,
            Transfer: prisma.transfer,
          };
          const model = models[item.type];
          if (!model) {
            console.log(`⚠️ Invalid transaction type: ${item.type}`);
            continue;
          }

          // Create the actual transaction
          const newTransaction = await model.create({
            data: {
              amount: item.amount,
              date: todayLocal.toDate(), // stored as UTC
              description: item.description,
              status: "Pending",
              recurringTransaction: {connect : {id: item.id}},
              isActive: true,
              category: { connect: { id: item.categoryId } },
              user: { connect: { id: item.userId } },
            },
          });

          console.log(
            `✅ Generated ${item.type} (ID: ${newTransaction.id}) for user ${item.userId}`
          );

          // Update nextDueDate in UTC
          const newNextDue = moment(nextDueLocal)
            .add(item.interval, item.unit)
            .startOf("day")
            .utc()
            .toDate();

          await prisma.recurringTransaction.update({
            where: { id: item.id },
            data: { nextDueDate: newNextDue },
          });

          console.log(
            `📅 Updated next due date for recurring transaction ${item.id} to ${moment(
              newNextDue
            ).format("YYYY-MM-DD")}`
          );
        }
      }
    }
    console.log("✅ Recurring transaction generation completed");
  } catch (err) {
    console.error("❌ Error processing recurring transactions:", err);
  }
});

// 3️⃣ Send reminders for upcoming payments (2 days before due date) - Run every day at 12 AM
cron.schedule("0 0 * * *", async () => {
  const today = moment().startOf("day");
  const twoDaysFromNow = moment().add(2, "days").startOf("day");
  
  console.log("📧 Running payment reminder check...");

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
            lt: twoDaysFromNow.add(1, "day").toDate(),
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          category: {
            select: {
              name: true,
            },
          },
        },
      });

      for (const item of upcomingItems) {
        // TODO: Implement email/SMS notification service
        console.log(`📬 Reminder: ${name} ${item.id} due on ${moment(item.date).format("YYYY-MM-DD")}`);
        console.log(`   User: ${item.user.email}`);
        console.log(`   Amount: ${item.amount}`);
        console.log(`   Category: ${item.category?.name || "N/A"}`);
        
        // Example: await sendEmailReminder(item.user.email, item);
        // Example: await sendSMSReminder(item.user.phone, item);
      }
    }
    console.log("✅ Payment reminder check completed");
  } catch (err) {
    console.error("❌ Error processing payment reminders:", err);
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("🛑 Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🛑 Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});

console.log("✅ Cron jobs initialized successfully");