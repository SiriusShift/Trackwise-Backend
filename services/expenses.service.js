const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const moment = require("moment");
const { validateCategory } = require("./categories.service");
const { validateAsset } = require("./assets.service");
const { uploadFileToS3, deleteFileFromS3 } = require("./s3.service");

const validateExpense = async (id) => {
  const expense = await prisma.expense.findFirst({
    where: { id: parseInt(id) },
  });

  if (!expense) {
    throw new Error("Expense not found"); // ❌ Throw error here
  }

  return expense;
};
const getExpenses = async (userId, query) => {
  const {
    search,
    pageIndex,
    pageSize,
    Categories,
    startDate,
    endDate,
    status,
  } = query;

  const page = parseInt(pageIndex) >= 0 ? parseInt(pageIndex) + 1 : 1;
  const size = parseInt(pageSize) > 0 ? parseInt(pageSize) : 10;
  const skip = (page - 1) * size;

  const filters = {
    userId: parseInt(userId),
    ...(startDate && endDate
      ? {
          date: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        }
      : {}),
    isActive: true,
  };

  if (search) {
    filters.description = {
      startsWith: search,
      mode: "insensitive",
    };
  }

  if (status) {
    filters.status = {
      startsWith: status,
    };
  }

  if (Categories !== undefined) {
    filters.categoryId = {
      in: JSON.parse(Categories),
    };
  }

  const totalCount = await prisma.expense.count({ where: filters });

  const expenses = await prisma.expense.findMany({
    where: filters,
    orderBy: { date: "desc" },
    skip,
    take: size,
  });

  const detailedExpenses = await Promise.all(
    expenses.map(async (expense) => {
      if (expense?.sourceId !== null) {
        const asset = await prisma.asset.findFirst({
          where: { id: expense.sourceId },
        });
        const category = await prisma.categories.findFirst({
          where: { id: expense.categoryId },
        });
        return { ...expense, asset, category };
      }
      return undefined;
    })
  );

  const filteredExpenses = detailedExpenses.filter(
    (item) => item !== undefined
  );

  const totalPages = Math.ceil(totalCount / size);

  return {
    data: filteredExpenses,
    totalCount,
    totalPages,
  };
};

const postExpense = async (userId, data, file) => {
  const amount = parseInt(data.amount);
  const categoryId = parseInt(data.category);
  const assetId = parseInt(data.source);

  validateCategory(categoryId);
  const asset = validateAsset(assetId, userId);

  // Check if the balance is sufficient
  if (asset.balance < amount) {
    throw new Error("Insufficient balance");
  }

  const image = file ? await uploadFileToS3(file, "Expense", userId) : null;

  console.log("image :", image);

  // Create the expense
  const expense = await prisma.expense.create({
    data: {
      amount: amount,
      description: data.description,
      image: image,
      status: data.date > new Date() ? "Unpaid" : "Paid",
      type: "Expense",
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
      date: data.date,
      user: {
        connect: {
          id: userId,
        },
      },
    },
  });

  // Create a transaction history record
  await prisma.transactionHistory.create({
    data: {
      expenseId: expense.id,
      userId: userId,
      fromAssetId: assetId,
      transactionType: "Expense",
      amount: amount,
      description: data.description,
      date: data.date,
    },
  });

  return expense;
};

const updateExpense = async (userId, data, file, id) => {
  console.log("params:", id);
  console.log("category id", data);

  try {
    const amount = parseInt(data?.amount);
    const categoryId = parseInt(data.category);
    const assetId = parseInt(data.source);

    const expense = validateExpense(id);
    let image;

    if (file) {
      image = await uploadFileToS3(file, "Expense", userId);
      if (expense?.image) {
        await deleteFileFromS3(expense?.image);
      }
    } else if (data?.image) {
      image = expense?.image;
    } else {
      image = await deleteFileFromS3(expense?.image);
    }

    console.log("image: ", image, id);

    const expenseUpdate = await prisma.expense.update({
      where: { id: parseInt(id) },
      data: {
        amount: amount,
        description: data.description,
        recurring: data.recurring,
        image: image,
        status: data.date > new Date() ? "Unpaid" : "Paid",
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
        date: data.date,
        user: {
          connect: {
            id: userId,
          },
        },
      },
    });

    console.log(expenseUpdate);

    // Fetch the transaction history record related to the expense
    const transaction = await prisma.transactionHistory.findFirst({
      where: { expenseId: parseInt(id) }, // Ensure expenseId is properly converted to an integer
    });

    await prisma.transactionHistory.update({
      where: { id: parseInt(transaction?.id) },
      data: {
        amount: parseInt(data.amount),
        description: data.description,
        date: data.date,
        updatedAt: new Date(),
      },
    });

    console.log("return");

    return expenseUpdate;
  } catch (err) {
    console.log(err);
    return err;
  }
};

const deleteExpense = async (userId, id) => {
  // If the expense is a recurring parent
  validateExpense(id);

  // if (data.isRecurring) {
  //   console.log("Recurring Expense:", data);

  //   // Mark the parent expense as deleted
  //   await prisma.expense.update({
  //     where: { id: parseInt(id) },
  //     data: { isActive: false },
  //   });

  //   if (data.status === "Paid") {
  //     // Update all linked recurring expenses
  //     await prisma.expense.updateMany({
  //       where: { recurringExpenseId: parseInt(id) },
  //       data: { isActive: false },
  //     });

  //     // Update transaction history for ALL linked expenses
  //     await prisma.transactionHistory.updateMany({
  //       where: { expenseId: parseInt(id) },
  //       data: { isActive: false },
  //     });

  //     // Also update transaction history for all child expenses
  //     await prisma.transactionHistory.updateMany({
  //       where: {
  //         expenseId: {
  //           in: (
  //             await prisma.expense.findMany({
  //               where: { recurringExpenseId: parseInt(id) },
  //               select: { id: true },
  //             })
  //           ).map((expense) => expense.id),
  //         },
  //       },
  //       data: { isActive: false },
  //     });
  //   }
  // }
  // // If it's a child expense in a recurring series
  // else if (data.recurringExpenseId !== null && !data.isRecurring) {
  //   console.log("Child of Recurring Expense:", data);

  //   if (data.status === "Paid") {
  //     // Delete all expenses tied to the recurringExpenseId
  //     await prisma.expense.updateMany({
  //       where: { recurringExpenseId: parseInt(data.recurringExpenseId) },
  //       data: { isActive: false },
  //     });

  //     // Delete transaction history for all related expenses
  //     await prisma.transactionHistory.updateMany({
  //       where: { expenseId: parseInt(id) },
  //       data: { isActive: false },
  //     });

  //     // Also update transaction history for all child expenses
  //     await prisma.transactionHistory.updateMany({
  //       where: {
  //         expenseId: {
  //           in: (
  //             await prisma.expense.findMany({
  //               where: {
  //                 recurringExpenseId: parseInt(data.recurringExpenseId),
  //               },
  //               select: { id: true },
  //             })
  //           ).map((expense) => expense.id),
  //         },
  //       },
  //       data: { isActive: false },
  //     });
  //   } else {
  //     await prisma.expense.update({
  //       where: { id: parseInt(id) },
  //       data: { isActive: false },
  //     });

  //     await prisma.transactionHistory.updateMany({
  //       where: { expenseId: parseInt(id) },
  //       data: { isActive: false },
  //     });
  //   }
  // }
  // If it's a standalone expense
  console.log("Regular Expense:", data);

  await prisma.expense.update({
    where: { id: parseInt(id) },
    data: { isActive: false },
  });

  await prisma.transactionHistory.updateMany({
    where: { expenseId: parseInt(id) },
    data: { isActive: false },
  });
};

module.exports = {
  getExpenses,
  postExpense,
  updateExpense,
  deleteExpense,
};
