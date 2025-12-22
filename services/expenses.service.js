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
    select: {
      id: true,
      date: true,
      category: {
        select: {
          id: true,
          name: true,
          type: true,
          icon: true,
          isActive: true,
        },
      },
      asset: {
        select: {
          id: true,
          name: true,
          balance: true,
        },
      },
      description: true,
      amount: true,
      image: true,
      isActive: true,
      status: true,
      recurringTemplate: {
        select: {
          fromAsset: true,
          amount: true,
          type: true,
          // isVariable: true,
          auto: true,
          unit: true,
          interval: true,
          endDate: true,
        },
      },
      transactionHistory: {
        where: {
          isActive: true,
        },
        select: {
          id: true,
          transactionType: true,
          amount: true,
          description: true,
          date: true,
          fromAsset: true,
          image: true,
        },
      },
    },
    skip,
    take: size,
  });

  // const detailedExpenses = await Promise.all(
  //   expenses.map(async (expense) => {
  //     console.log("expenses:", expense);
  //     let asset;
  //     let category;
  //     if (expense?.assetId !== null) {
  //       asset = await prisma.asset.findFirst({
  //         where: { id: expense.assetId },
  //       });
  //     }
  //     if (expense?.categoryId !== null) {
  //       category = await prisma.categories.findFirst({
  //         where: { id: expense.categoryId },
  //       });
  //     }
  //     return { ...expense, asset, category };
  //   })
  // );

  const filteredExpenses = expenses.filter((item) => item !== undefined);
  console.log(filteredExpenses, "filtered");
  const expensesWithBalance = filteredExpenses?.map((expense) => ({
    ...expense,
    type: "Expense",
    remainingBalance:
      Number(expense.amount) -
      expense.transactionHistory.reduce(
        (acc, curr) => acc + (Number(curr?.amount) || 0),
        0
      ),
  }));

  const totalPages = Math.ceil(totalCount / size);

  return {
    data: expensesWithBalance,
    totalCount,
    totalPages,
  };
};

const postExpense = async (userId, data, file) => {
  const amount = Number(data.amount);
  const categoryId = Number(data.category);
  const assetId = Number(data.from);

  console.log("Amount: ", amount);

  validateCategory(categoryId);
  if (assetId) {
    const asset = validateAsset(assetId, userId);

    // Check if the balance is sufficient
    if (data?.date <= moment() && asset.balance < amount) {
      throw new Error("Insufficient balance");
    }
  }

  const image = file ? await uploadFileToS3(file, "Expense", userId) : null;

  console.log("image :", image);

  // Create the expense
  const expense = await prisma.expense.create({
    data: {
      amount: amount,
      description: data.description,
      status: new Date(data.date) > new Date() ? "Pending" : "Paid",
      category: {
        connect: {
          id: categoryId,
        },
      },
      ...(assetId && {
        asset: {
          connect: {
            id: assetId,
          },
        },
      }),
      date: data.date,
      user: {
        connect: {
          id: userId,
        },
      },
    },
  });

  if (new Date(data?.date) <= new Date()) {
    await prisma.transactionHistory.create({
      data: {
        expense: {
          connect: {
            id: expense.id,
          },
        },
        image: image,
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
  }

  // Create a transaction history record

  return expense;
};

const updateExpense = async (userId, data, file, id) => {
  console.log("params:", id);
  console.log("category id", data);

  try {
    const amount = Number(data?.amount);
    const categoryId = parseInt(data.category);
    const assetId = parseInt(data.from);
    const isFuture = new Date(data.date).getTime() > Date.now();

    const expense = await validateExpense(id);
    console.log(expense);
    let image;

    if (file) {
      image = await uploadFileToS3(file, "Expense", userId);
      console.log(expense?.image);
      if (expense?.image) {
        console.log("delete image");
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
        status: isFuture ? "Pending" : "Paid",
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

    // // Fetch the transaction history record related to the expense
    // const transaction = await prisma.transactionHistory.findFirst({
    //   where: { expenseId: parseInt(id) }, // Ensure expenseId is properly converted to an integer
    // });

    // await prisma.transactionHistory.update({
    //   where: { id: parseInt(transaction?.id) },
    //   data: {
    //     amount: Number(data.amount),
    //     description: data.description,
    //     date: data.date,
    //     updatedAt: new Date(),
    //     image,
    //     fromAsset: {
    //       connect: { id: assetId },
    //     },
    //     isActive: isFuture ? false : true,
    //   },
    // });

    console.log("return");

    return expenseUpdate;
  } catch (err) {
    console.log(err);
    throw new Error("Internal server error");
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

const postPayment = async (userId, data, id, file) => {
  try {
    const amount = Number(data.amount);
    const assetId = parseInt(data.from);
    console.log(data, "data from patch payment");

    const expense = await validateExpense(id);
    const image = file ? await uploadFileToS3(file, "Expense", userId) : null;

    // Sum of previous payments for this expense
    const balance = await prisma.transactionHistory.aggregate({
      where: {
        expenseId: expense.id,
      },
      _sum: {
        amount: true,
      },
    });

    const previousPayments = balance._sum.amount || 0;
    const totalPaid = Number(previousPayments) + amount;
    console.log(previousPayments, "previous payments")
    console.log(totalPaid, "total paid")

    let newStatus = "Unpaid";
    if (totalPaid >= expense.amount) newStatus = "Paid";
    else if (totalPaid > 0) newStatus = "Partial";

    const expenseUpdate = await prisma.expense.update({
      where: { id: parseInt(id) },
      data: {
        status: newStatus,
      },
    });

    await prisma.transactionHistory.create({
      data: {
        expense: { connect: { id: expenseUpdate.id } },
        user: { connect: { id: userId } },
        fromAsset: { connect: { id: assetId } },
        image,
        transactionType: "Expense",
        amount,
        description: data.description,
        date: data.date,
      },
    });

    return;
  } catch (err) {
    console.log(err);
    throw new Error(err);
  }
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
    };
    console.log("filters", filters);
    const groupedExpenses = await prisma.$queryRawUnsafe(
      `SELECT 
        date_trunc('${mode}', "date") AS "${mode}",
        sum(amount) AS total
      FROM "TransactionHistory"
      WHERE "date" >= '${moment(startDate)
        .subtract(1, "month")
        .toISOString()}'::timestamp AND "date" <= '${endDate}'::timestamp AND "isActive" = true AND "transactionType" = 'Expense'
      GROUP BY "${mode}"
      ORDER BY "${mode}"`
    );
    console.log("group expense!", groupedExpenses);

    const trend = (
      ((groupedExpenses[1]?.total - groupedExpenses[0]?.total) /
        groupedExpenses[0]?.total) *
      100
    ).toFixed(2);

    const categoryExpenses = await prisma.transactionHistory.groupBy({
      by: ["expenseId"],
      where: {
        ...filters,
        transactionType: "Expense",
      },
      _sum: { amount: true },
    });

    console.log(categoryExpenses);

    const detailedCategoryExpenses = await Promise.all(
      categoryExpenses.map(async (item) => {
        const expense = await prisma.expense.findFirst({
          where: { id: item.expenseId },
          include: { category: true },
        });
        return {
          categoryId: expense.categoryId,
          categoryName: expense?.category?.name || "Unknown",
          total: Number(item._sum.amount) || 0,
        };
      })
    );

    console.log("detailed category", detailedCategoryExpenses);

    const totalExpense = detailedCategoryExpenses.reduce(
      (acc, curr) => acc + curr.total,
      0
    );

    return {
      trend,
      data: detailedCategoryExpenses,
      total: Number(totalExpense) || 0,
    };
  } catch (err) {
    console.log(err);
    throw new Error("Internal server error");
  }
};

module.exports = {
  getExpenses,
  postExpense,
  updateExpense,
  deleteExpense,
  getExpenseGraph,
  postPayment,
};
