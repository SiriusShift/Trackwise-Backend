const { PrismaClient } = require("@prisma/client");
const moment = require("moment");
const cron = require("node-cron");

const prisma = new PrismaClient();

// Run every day at 12 AM
cron.schedule("0 0 * * *", async () => {
  const today = moment().startOf("day"); // Ensures time is 00:00:00
  console.log("Running expense overdue check...");

  try {
    const recurring = await prisma.expense.findMany({
      where: {
        isRecurring: true,
        isDeleted: false,
        status: "Unpaid",
      },
    });

    for (const expense of recurring) {
      // ✅ Use for...of instead of forEach
      const dueDate = moment(expense.date).startOf("day"); // Normalize time

      if (dueDate.isBefore(today)) {
        await prisma.expense.update({
          where: { id: expense.id },
          data: { status: "Overdue" },
        });
        console.log(`Updated expense ${expense.id} to Overdue`);
      }
    }
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
