const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const moment = require("moment");
const { validateCategory } = require("./categories.service");
const { validateAsset } = require("./assets.service");
const { uploadFileToS3, deleteFileFromS3 } = require("./s3.service");
const { connect } = require("../routes/expenses.routes");

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
      console.log("expenses:", expense);
      if (expense?.assetId !== null) {
        const asset = await prisma.asset.findFirst({
          where: { id: expense.assetId },
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
  const assetId = parseInt(data.from);

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
      status: data.date > new Date() ? "Pending" : "Paid",
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
      expense: {
        connect: {
          id: expense.id,
        },
      },
      user: {
        connect: {
          id: userId,
        },
      },
      fromAsset: {
        connect: {
          id: assetId,
        },
      },
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
    const assetId = parseInt(data.from);

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

    const expenseUpdate = await prisma.expense.update({
      where: { id: parseInt(id) },
      data: {
        amount: amount,
        description: data.description,
        recurring: data.recurring,
        image: image,
        status: new Date(data.date).getTime() > Date.now() ? "Pending" : "Paid",
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
        updatedAt: new Date(),
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
        fromAsset: {
          connect: {
            id: assetId,
          },
        },
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

  await prisma.expense.update({
    where: { id: parseInt(id) },
    data: { isActive: false },
  });

  await prisma.transactionHistory.updateMany({
    where: { expenseId: parseInt(id) },
    data: { isActive: false },
  });
};

const getExpenseGraph = async (userId, query) => {
  const { startDate, endDate, mode } = query;

  try {
    const filters = {
      userId: parseInt(userId),
      date: {
        gte: startDate,
        lte: endDate,
      },
      isActive: true,
      status: "Paid"
    };
    console.log("filters", filters);
    const groupedExpenses = await prisma.$queryRawUnsafe(
      `SELECT 
        date_trunc('${mode}', "date") AS "${mode}",
        sum(amount) AS total
      FROM "Expense"
      WHERE "date" >= '${moment(startDate).subtract(1, "month").toISOString()}'::timestamp AND "date" <= '${endDate}'::timestamp AND "isActive" = true AND "status" = 'Paid'
      GROUP BY "${mode}"
      ORDER BY "${mode}"`
    );
    console.log("group expense!", groupedExpenses);

    const trend = (
      ((groupedExpenses[1]?.total - groupedExpenses[0]?.total) /
        groupedExpenses[0]?.total) *
      100
    ).toFixed(2);

    const categoryExpenses = await prisma.expense.groupBy({
      by: ["categoryId"],
      where: filters,
      _sum: { amount: true },
    });

    const detailedCategoryExpenses = await Promise.all(
      categoryExpenses.map(async (item) => {
        const category = await prisma.categories.findFirst({
          where: { id: item.categoryId },
        });
        return {
          categoryId: item.categoryId,
          categoryName: category?.name || "Unknown",
          total: item._sum.amount || 0,
        };
      })
    );

    console.log("detailed category", detailedCategoryExpenses)

    const totalExpense = await prisma.expense.aggregate({
      where: filters,
      _sum: { amount: true },
    });

    return {
      trend,
      data: detailedCategoryExpenses,
      total: totalExpense._sum.amount || 0,
    };
  } catch (err) {
    console.log(err);
    return err;
  }
};

module.exports = {
  getExpenses,
  postExpense,
  updateExpense,
  deleteExpense,
  getExpenseGraph,
};
