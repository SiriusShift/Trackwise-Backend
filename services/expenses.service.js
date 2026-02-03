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
        ...(assetId && {fromAsset: {
          connect: {
            id: assetId,
          },
        }}),
        transactionType: "Expense",
        amount: amount,
        description: data.description,
        date: data.date,
      },
    });
    return expense;
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

  await prisma.expense.update({
    where: { id: parseInt(id) },
    data: { isActive: false },
  });

  await prisma.transactionHistory.updateMany({
    where: { expenseId: parseInt(id) },
    data: { isActive: false },
  });

  return;
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
        isActive: true
      },
      _sum: {
        amount: true,
      },
    });

    const previousPayments = balance._sum.amount || 0;
    const totalPaid = Number(previousPayments) + amount;
    console.log(previousPayments, "previous payments");
    console.log(totalPaid, "total paid");

    let newStatus = "Pending";
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

  const userIdNum = Number(userId);

  const filters = {
    userId: userIdNum,
    date: {
      gte: startDate,
      lte: endDate,
    },
    isActive: true,
    transactionType: "Expense",
  };

  try {
    /* ------------------ TREND DATA ------------------ */
    const trendData = await prisma.$queryRawUnsafe(`
      SELECT
        date_trunc('${mode}', "date") AS period,
        SUM(amount) AS total
      FROM "TransactionHistory"
      WHERE
        "date" >= '${moment(startDate).subtract(1, "month").toISOString()}'::timestamp
        AND "date" <= '${endDate}'::timestamp
        AND "isActive" = true
        AND "transactionType" = 'Expense'
      GROUP BY period
      ORDER BY period
    `);

    const trend =
      trendData.length >= 2 && trendData[0].total
        ? (
            ((Number(trendData[1].total) - Number(trendData[0].total)) /
              Number(trendData[0].total)) *
            100
          ).toFixed(2)
        : "0.00";

    /* ---------------- CATEGORY TOTALS ---------------- */
    const expenseGroups = await prisma.transactionHistory.groupBy({
      by: ["expenseId"],
      where: filters,
      _sum: { amount: true },
    });

    const expenseIds = expenseGroups
      .map(e => e.expenseId)
      .filter(Boolean);

    const expenses = await prisma.expense.findMany({
      where: { id: { in: expenseIds } },
      include: { category: true },
    });

    const expenseMap = new Map(
      expenses.map(e => [
        e.id,
        {
          categoryId: e.categoryId,
          categoryName: e.category?.name ?? "Unknown",
        },
      ])
    );

    const categoryTotals = expenseGroups.reduce((acc, item) => {
      const meta = expenseMap.get(item.expenseId);
      if (!meta) return acc;

      if (!acc[meta.categoryId]) {
        acc[meta.categoryId] = {
          categoryId: meta.categoryId,
          categoryName: meta.categoryName,
          total: 0,
        };
      }

      acc[meta.categoryId].total += Number(item._sum.amount ?? 0);
      return acc;
    }, {});

    const data = Object.values(categoryTotals);

    const totalExpense = data.reduce(
      (sum, item) => sum + item.total,
      0
    );

    /* ------------------ RESPONSE ------------------ */
    return {
      trend,
      data,
      total: totalExpense,
    };
  } catch (error) {
    console.error("getExpenseGraph error:", error);
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
