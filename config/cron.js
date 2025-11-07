const { PrismaClient } = require("@prisma/client");
const moment = require("moment");
const cron = require("node-cron");

const prisma = new PrismaClient();

// Run every day at 12 AM
cron.schedule("0 0 * * *", async () => {
  const today = moment().startOf("day");
  console.log("Running overdue check for expenses, income, and transfers...");

  const models = [
    { name: "expense", model: prisma.expense },
    { name: "income", model: prisma.income },
    { name: "transfer", model: prisma.transfer },
  ];

  try {
    for (const { name, model } of models) {
      const recurring = await model.findMany({
        where: {
          recurringId: { not: null },
          isActive: true,
          status: "Pending",
        },
      });

      for (const item of recurring) {
        const dueDate = moment(item.date).startOf("day");

        if (dueDate.isBefore(today)) {
          await model.update({
            where: { id: item.id },
            data: { status: "Overdue" },
          });
          console.log(`Updated ${name} ${item.id} to Overdue`);
        }
      }
    }
  } catch (err) {
    console.error("Error processing recurring records:", err);
  } finally {
    await prisma.$disconnect();
  }
});

cron.schedule("0 0 * * *", async () => {
  const today = moment().startOf("day"); // Ensures time is 00:00:00
  const models = [
    { name: "Expense", model: prisma.expense },
    { name: "Income", model: prisma.income },
    { name: "Transfer", model: prisma.transfer },
  ];
  try {
    const recurring = prisma.recurringTransaction.findMany({
      where: {
        isActive: true,
      },
    });
    for (const transaction of recurring) {
      const transactionModel = models.find((m) => m.name === item.type);
      if (!transactionModel) {
        console.warn(`⚠️ No model found for type: ${item.type}`);
        continue;
      }

      // Example: check if today is the next scheduled date
      const nextDate = moment(item.nextDate).startOf("day");

      if (today.isSameOrAfter(nextDate)) {
        await transactionModel.model.create({
          data: {
            amount: item.amount,
            date: today.toDate(),
            description: item.description,
            status: "Pending",
            recurringId: item.id,
            isActive: true,
            category: {
              connect: {
                id: transaction?.categoryId,
              },
            },
            user: {
              connect: {
                id: transaction?.userId,
              },
            },
          },
        });

        await prisma.recurringTransaction.update({
          where: {
            id: transaction?.id,
          },
          data: {
            nextDueDate: moment(nextDate)
              .add(transaction.interval, transaction?.unit)
              .toDate(),
          },
        });
      }
    }
  } catch (err) {
    console.error("Error processing recurring expenses:", err);
  } finally {
    await prisma.$disconnect(); // ✅ Ensure Prisma disconnects properly
  }
});

cron.schedule("0 0 * * *", async () => {
  const today = moment().startOf("day"); // Ensures time is 00:00:00
  try {
  } catch (err) {
    console.error("Error processing recurring expenses:", err);
  } finally {
    await prisma.$disconnect(); // ✅ Ensure Prisma disconnects properly
  }
});

/* Create a scheduler where 
1.) A scheduler where it will check everyday 12am, to check all expenses that exceeds their due date, 
then update their status to Overdue
2.) A scheduler where it will create a new expense row per expense that has status to Unpaid
3.) A scheduler where it will check everyday 12am, to check all expenses that is 2 days before their due date, 
then send a email / text that notifies them of their upcoming payment
*/
