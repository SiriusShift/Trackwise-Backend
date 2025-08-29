const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { validateCategory } = require("./categories.service");
const { connect } = require("../routes/emails.routes");

const postRecurring = async (userId, data) => {
  const amount = parseInt(data.amount);
  const categoryId = parseInt(data.category);
  try {
    validateCategory(categoryId);
    const recurringData = {
      user: { connect: { id: userId } },
      type: data?.type,
      category: { connect: { id: categoryId } },
      amount: data?.amount,
      startDate: new Date(),
      nextDueDate: data?.date,
      interval: data?.repeat?.interval,
      unit: data?.repeat?.unit,
    };

    if (data?.auto) {
      if (data?.type === "Expense" || data?.type === "Transfer") {
        recurringData.RecurringTransferFrom = {
          connect: { id: data?.from },
        };
      }

      if (data?.type === "Income" || data?.type === "Transfer") {
        recurringData.RecurringTransferTo = {
          connect: { id: data?.to },
        };
      }
    }
    if (data?.endDate) {
      recurringData.endDate = data?.endDate;
    }

    const recurring = await prisma.recurringTransaction.create({
      data: recurringData,
    });

    await prisma.expense.create({
      data: {
        amount: amount,
        description: data.description,
        image: image,
        status: data?.auto ? "Paid" : "Pending",
        category: {
          connect: {
            id: categoryId,
          },
        },
        asset: {
          connect: {
            id: assetId,
          },
        },
        recurringTemplate: {
          connect: {
            id: recurring?.id,
          },
        },
        date: data.date,
        user: {
          connect: {
            id: userId,
          },
        },
      },
    });
  } catch (err) {
    return err;
  }
};

module.exports = {
  postRecurring,
};
