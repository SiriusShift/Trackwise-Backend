const { PrismaClient } = require("@prisma/client");
const { validateAsset } = require("./assets.service");
const prisma = new PrismaClient();
const moment = require("moment");
const { mode } = require("crypto-js");
const { validateTransfers } = require("./transfers.service");
const { validateExpense } = require("./expenses.service");
const { validateIncome } = require("./incomes.service");
const validateTransactionHistory = async (id) => {
  const history = await prisma.transactionHistory.findFirst({
    where: { id: parseInt(id) },
  });

  if (!history) {
    throw new Error("History not found"); // ❌ Throw error here
  }

  return history;
};

const getHistory = async (userId, request) => {
  const { pageIndex, pageSize } = request;
  try {
    const page = parseInt(pageIndex) >= 0 ? parseInt(pageIndex) + 1 : 1;
    const size = parseInt(pageSize) > 0 ? parseInt(pageSize) : 10;
    const skip = (page - 1) * size;

    const filters = {
      isActive: true,
      userId: userId,
      // OR: [
      //   {
      //     transactionType: "Expense",
      //     expense: {
      //       status: "Paid",
      //     },
      //   },
      //   {
      //     transactionType: "Income",
      //     income: {
      //       status: "Received",
      //     },
      //   },
      // ],
    };
    const totalCount = await prisma.transactionHistory.count({
      where: {
        isActive: true,
        userId: userId,
      },
    });

    const transactions = await prisma.transactionHistory.findMany({
      where: filters,
      select: {
        id: true,
        transactionType: true,
        date: true,
        amount: true,
        description: true,
        expense: {
          select: {
            status: true,
            category: {
              select: {
                name: true,
                icon: true,
              },
            },
          },
        },
        income: {
          select: {
            status: true,
            category: {
              select: {
                name: true,
                icon: true,
              },
            },
          },
        },
        transfer: {
          select: {
            status: true,
            category: {
              select: {
                name: true,
                icon: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          date: "desc",
        },
      ],
      ...(skip && { skip }),
      ...(size && { take: size }),
    });

    const filter = transactions.map((item) => {
      return {
        id: item.id,
        type: item.transactionType,
        amount: item.amount,
        description: item.description,
        date: item?.date,
        ...(item?.expense && {
          category: {
            name: item?.expense?.category?.name,
            icon: item?.expense?.category?.icon,
          },
          status: item?.expense?.status,
        }),
        ...(item?.income && {
          category: {
            name: item?.income?.category?.name,
            icon: item?.income?.category?.icon,
          },
          status: item?.income?.status,
        }),
        ...(item?.transfer && {
          category: {
            name: item?.transfer?.category?.name,
            icon: item?.transfer?.category?.icon,
          },
          status: item?.transfer?.status,
        }),
        // ...(item?.transfer && {
        //   category: {
        //     name: item?.transfer?.category?.name,
        //     icon: item?.transfer?.category?.icon,
        //   },
        // }),
      };
    });

    const totalPages = Math.ceil(totalCount / size);

    // const transaction = [...expense, ...income, ...transfer];
    // const sorted = transaction.sort(
    //   (a, b) => b.date.getTime() - a.date.getTime()
    // );
    return {
      filter,
      totalCount,
      totalPages,
    };
  } catch (err) {
    console.log(err);
    throw new Error("Internal server error");
  }
};

const getStatistics = async (userId, data) => {
  const { startDate, endDate, mode } = data;

  // ✅ Convert to plain dates immediately — avoids moment mutation bugs
  const start     = moment(startDate).startOf(mode).toDate();
  const end       = moment(endDate).endOf(mode).toDate();
  const prevStart = moment(startDate).clone().subtract(1, mode).startOf(mode).toDate();
  const prevEnd   = moment(endDate).clone().subtract(1, mode).endOf(mode).toDate();

  const dateFilter     = { gte: start,     lte: end     };
  const prevDateFilter = { gte: prevStart,  lte: prevEnd  };

  // ✅ Run independent queries in parallel
  const [assetsResult, assets] = await Promise.all([
    prisma.asset.aggregate({
      _sum: { balance: true },
      where: { isActive: true, userId },
    }),
    prisma.asset.findMany({
      where: { isActive: true, userId },
      select: {
        name: true,
        balance: true,
        sentTransactionHistory:     { where: { isActive: true } },
        receivedTransactionHistory: { where: { isActive: true } },
      },
    }),
  ]);

  const assetBalance = assets.map((item) => ({
    name: item.name,
    balance:
      Number(item.balance) +
      item.receivedTransactionHistory.reduce((a, c) => a + Number(c.amount), 0) -
      item.sentTransactionHistory.reduce((a, c) => a + Number(c.amount), 0),
  }));

  // ✅ Reusable breakdown helper — filters at every relation level
  const getCategoryBreakdown = async (type, dateFilter) => {
    // Income categories link via `incomes`, Expense via `expenses`
    const relation = type === "Income" ? "incomes" : "expenses";

    const breakdown = await prisma.categories.findMany({
      where: {
        type,
        isActive: true,
        [relation]: {
          some: {
            transactionHistory: {
              some: { userId, isActive: true, date: dateFilter },
            },
          },
        },
      },
      select: {
        name: true,
        [relation]: {
          // ✅ Filter the relation itself so only in-range incomes/expenses are included
          where: {
            transactionHistory: {
              some: { userId, isActive: true, date: dateFilter },
            },
          },
          select: {
            // ✅ Filter transactionHistory too — double filter prevents leaks
            transactionHistory: {
              where: { userId, isActive: true, date: dateFilter },
            },
          },
        },
      },
    });

    return breakdown.map((item) => ({
      name: item.name,
      amount: item[relation].reduce(
        (acc, rel) =>
          acc +
          rel.transactionHistory.reduce((a, c) => a + Number(c.amount), 0),
        0,
      ),
    }));
  };

  // ✅ All aggregates + breakdowns in parallel
  const [
    income,
    expense,
    prevIncome,
    prevExpense,
    allTimeIncome,
    allTimeExpense,
    prevAllTimeIncome,
    prevAllTimeExpense,
    incomeBreakdown,
    expenseBreakdown,
  ] = await Promise.all([
    prisma.transactionHistory.aggregate({
      _sum: { amount: true },
      where: { userId, transactionType: "Income",  isActive: true, date: dateFilter },
    }),
    prisma.transactionHistory.aggregate({
      _sum: { amount: true },
      where: { userId, transactionType: "Expense", isActive: true, date: dateFilter },
    }),
    prisma.transactionHistory.aggregate({
      _sum: { amount: true },
      where: { userId, transactionType: "Income",  isActive: true, date: prevDateFilter },
    }),
    prisma.transactionHistory.aggregate({
      _sum: { amount: true },
      where: { userId, transactionType: "Expense", isActive: true, date: prevDateFilter },
    }),
    prisma.transactionHistory.aggregate({
      _sum: { amount: true },
      where: { userId, transactionType: "Income",  isActive: true },
    }),
    prisma.transactionHistory.aggregate({
      _sum: { amount: true },
      where: { userId, transactionType: "Expense", isActive: true },
    }),
    prisma.transactionHistory.aggregate({
      _sum: { amount: true },
      where: { userId, transactionType: "Income",  isActive: true, date: { lte: prevEnd } },
    }),
    prisma.transactionHistory.aggregate({
      _sum: { amount: true },
      where: { userId, transactionType: "Expense", isActive: true, date: { lte: prevEnd } },
    }),
    getCategoryBreakdown("Income",  dateFilter),
    getCategoryBreakdown("Expense", dateFilter),
  ]);

  const baseBalance = Number(assetsResult._sum.balance ?? 0);
  const balance     = baseBalance + Number(allTimeIncome._sum.amount  ?? 0) - Number(allTimeExpense._sum.amount  ?? 0);
  const prevBalance = baseBalance + Number(prevAllTimeIncome._sum.amount ?? 0) - Number(prevAllTimeExpense._sum.amount ?? 0);

  function calcTrend(curr, prev) {
    if (!prev || prev === 0) return 0;
    return Number((((curr - prev) / prev) * 100).toFixed(2));
  }

  return {
    balance,
    expense:          Number(expense._sum.amount   ?? 0),
    income:           Number(income._sum.amount    ?? 0),
    expenseTrend:     calcTrend(expense._sum.amount,  prevExpense._sum.amount),
    incomeTrend:      calcTrend(income._sum.amount,   prevIncome._sum.amount),
    balanceTrend:     calcTrend(balance, prevBalance),
    assetBreakdown:   assetBalance,
    incomeBreakdown,
    expenseBreakdown,
  };
};

const editHistory = async (userId, data, file, id) => {
  try {
    console.log("Editing transaction:", id);

    const amount = Number(data?.amount);
    const assetFrom = parseInt(data.from);
    const assetTo = parseInt(data.to);

    const history = await validateTransactionHistory(id);
    if (!history) throw new Error("Transaction history not found");

    // Handle image updates
    let image;
    if (file) {
      image = await uploadFileToS3(file, "Expense", userId);
      if (history?.image) {
        console.log("Deleting old image");
        await deleteFileFromS3(history.image);
      }
    } else if (data?.image) {
      image = history.image; // Keep the existing image
    } else if (history.image) {
      await deleteFileFromS3(history.image);
      image = null;
    }

    // Update transaction history record
    const transaction = await prisma.transactionHistory.update({
      where: { id: parseInt(id) },
      data: {
        amount,
        description: data.description,
        ...(assetFrom && {
          fromAsset: { connect: { id: assetFrom } },
        }),
        ...(assetTo && {
          toAsset: { connect: { id: assetTo } },
        }),
        date: data.date,
        updatedAt: new Date(),
        user: { connect: { id: userId } },
        image,
      },
    });

    // Recalculate expense payment status if it's an Expense
    if (transaction?.transactionType === "Expense" && transaction?.expenseId) {
      const expense = await prisma.expense.findUnique({
        where: { id: transaction.expenseId },
      });

      if (expense) {
        // Sum all active transaction history payments for this expense
        const balance = await prisma.transactionHistory.aggregate({
          where: {
            expenseId: expense.id,
            isActive: true, // include only active
          },
          _sum: {
            amount: true,
          },
        });

        // Adjust for the edited transaction (avoid double-counting)
        const totalPaid = Number(balance._sum.amount || 0);

        console.log("Total Paid:", totalPaid, expense.amount);

        let newStatus = "Pending";
        if (totalPaid >= expense.amount) newStatus = "Paid";
        else if (totalPaid > 0) newStatus = "Partial";

        await prisma.expense.update({
          where: { id: expense.id },
          data: { status: newStatus },
        });
      }
    }

    return transaction;
  } catch (err) {
    console.error(err);
    throw new Error("Internal server error");
  }
};

const deleteHistory = async (id) => {
  try {
    const transaction = await prisma.transactionHistory.findUnique({
      where: { id: Number(id), isActive: true },
    });

    if (!transaction) throw new Error("Transaction not found");

    // Soft delete
    await prisma.transactionHistory.update({
      where: { id: Number(id) },
      data: { isActive: false },
    });

    // Update expense payment status
    if (transaction.transactionType === "Expense" && transaction.expenseId) {
      const expense = await prisma.expense.findUnique({
        where: { id: transaction.expenseId },
      });

      if (expense) {
        // Sum all remaining active transactions
        const balance = await prisma.transactionHistory.aggregate({
          where: {
            expenseId: expense.id,
            isActive: true,
          },
          _sum: { amount: true },
        });

        const totalPaid = Number(balance._sum.amount || 0);
        let newStatus = expense.status;
        console.log(totalPaid, "total paid delete");

        if (totalPaid === 0) newStatus = "Pending";
        else if (totalPaid < expense.amount) newStatus = "Partial";
        else if (totalPaid >= expense.amount) newStatus = "Paid";

        console.log(newStatus, "status");
        await prisma.expense.update({
          where: { id: expense.id },
          data: { status: newStatus },
        });
      }
    }
    if (transaction.transactionType === "Income" && transaction.incomeId) {
      const income = await prisma.expense.findUnique({
        where: { id: transaction.incomeId },
      });

      if (income) {
        // Sum all remaining active transactions
        const balance = await prisma.transactionHistory.aggregate({
          where: {
            incomeId: income.id,
            isActive: true,
          },
          _sum: { amount: true },
        });

        const totalReceived = Number(balance._sum.amount || 0);
        let newStatus = income.status;
        console.log(totalReceived, "total received delete");

        if (totalReceived === 0) newStatus = "Pending";
        else if (totalReceived < income.amount) newStatus = "Partial";
        else if (totalReceived >= income.amount) newStatus = "Received";

        console.log(newStatus, "status");
        await prisma.income.update({
          where: { id: income.id },
          data: { status: newStatus },
        });
      }
    }

    return;
  } catch (err) {
    console.error(err);
    throw new Error("Internal server error");
  }
};

const createTransactionRecord = async (data) => {
  const {
    amount,
    description,
    status,
    categoryId,
    assetFromId,
    assetToId,
    type,
    recurringId,
    date,
    userId,
    auto,
  } = data;

  let transaction;

  if (type === "Expense") {
    transaction = await prisma.expense.create({
      data: {
        amount: amount,
        description: description,
        status: status,
        category: {
          connect: {
            id: categoryId,
          },
        },
        ...(assetFromId &&
          auto && {
            asset: {
              connect: {
                id: assetFromId,
              },
            },
          }),
        recurringTemplate: {
          connect: {
            id: recurringId,
          },
        },
        date: date,
        user: {
          connect: {
            id: userId,
          },
        },
      },
    });
  } else if (type === "Income") {
    transaction = await prisma.income.create({
      data: {
        amount: amount,
        description: description,
        // image: image,
        status: status,
        category: {
          connect: {
            id: categoryId,
          },
        },
        ...(assetToId &&
          auto && {
            asset: {
              connect: {
                id: assetToId,
              },
            },
          }),
        recurringTemplate: {
          connect: {
            id: recurringId,
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
  } else if (type === "Transfer") {
    transaction = await prisma.transfer.create({
      data: {
        amount: amount,
        description: description,
        status: status,
        fromAsset: {
          connect: { id: assetFromId },
        },
        toAsset: {
          connect: { id: assetToId },
        },
        recurringTransfer: {
          connect: { id: recurringId },
        },
        date: date,
        user: {
          connect: { id: userId },
        },
      },
    });
  }

  return transaction;
};

const createTransactionHistory = async (id, data) => {
  const { amount, description, userId, assetFromId, type, assetToId, date } =
    data;

  await prisma.transactionHistory.create({
    data: {
      ...(type === "Expense" && {
        expense: { connect: { id: id } },
      }),
      ...(type === "Income" && {
        income: { connect: { id: id } },
      }),
      ...(type === "Transfer" && {
        transfer: { connect: { id: id } },
      }),
      user: { connect: { id: userId } },
      ...(type !== "Income" &&
        assetFromId && {
          fromAsset: { connect: { id: assetFromId } },
        }),
      ...(type !== "Expense" &&
        assetToId && {
          toAsset: { connect: { id: assetToId } },
        }),
      transactionType: type,
      amount,
      description,
      date: date || new Date(),
    },
  });
};

const createTransactionNotification = async (data) => {
  const { amount, description, userId, date, recurringId, status } = data;

  if (!status || status === "Paid" || status === "Received") {
    return; // No notification needed for successful transactions
  }

  let notificationData = {
    user: { connect: { id: userId } },
    relatedId: recurringId,
    relatedType: "RecurringTransaction",
  };

  if (status === "Failed") {
    notificationData.type = "Error";
    notificationData.title = "Recurring Payment Failed";
    notificationData.message = `Insufficient funds for "${description}". Required: ${amount}`;
  } else if (status === "Pending") {
    notificationData.type = "Warning";
    notificationData.title = "Payment Due";
    notificationData.message = `"${description}" payment of ${amount} is due on ${date}`;
  }

  await prisma.notification.create({ data: notificationData });
  return;
};



const archiveTransaction = async (type, id) => {
  // If the expense is a recurring parent
  console.log(type, "type!");
  switch (type) {
    case "expense":
      validateExpense(id);
      break;
    case "income":
      validateIncome(id);
      break;
    case "transfer":
      validateTransfers(id);
      break;
  }

  const models = [
    { name: "expense", model: prisma.expense },
    { name: "income", model: prisma.income },
    { name: "transfer", model: prisma.transfer },
  ];

  const model = models.find((model) => model.name === type);

  await model.model.update({
    where: { id: parseInt(id) },
    data: { isActive: false },
  });

  await prisma.transactionHistory.updateMany({
    where: {
      ...(type === "expense" && { expenseId: parseInt(id) }),
      ...(type === "income" && { incomeId: parseInt(id) }),
      ...(type === "transfer" && { transferId: parseInt(id) }),
    },
    data: { isActive: false },
  });

  return;
};

module.exports = {
  getHistory,
  editHistory,
  deleteHistory,
  createTransactionRecord,
  createTransactionHistory,
  createTransactionNotification,
  getStatistics,
  archiveTransaction,
};
