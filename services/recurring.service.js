const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { validateCategory } = require("./categories.service");
const moment = require("moment");
const {
  determineTransactionStatus,
  createTransactionHistory,
  createTransactionNotification,
  createTransactionRecord,
} = require("./transactions.service");
// const { postPayment } = require('./expenses.service');

const postRecurring = async (userId, data) => {
  const amount = Number(data.amount);
  const categoryId = parseInt(data.category);
  const assetFromId = parseInt(data?.from);
  const assetToId = parseInt(data?.to);

  console.log(amount, "Amount!");

  const status = await determineTransactionStatus(
    data?.type,
    data?.auto,
    assetFromId,
    amount
  );
  console.log(status, "status");
  try {
    await validateCategory(categoryId);

    const recurringData = {
      user: { connect: { id: userId } },
      type: data?.type,
      category: { connect: { id: categoryId } },
      amount: data?.amount,
      description: data?.description,
      startDate: data?.date,
      nextDueDate: moment(data?.date)
        ?.add(
          `${data?.repeat?.unit}s`,

          data?.repeat?.interval
        )
        .toDate(),
      interval: data?.repeat?.interval,
      unit: data?.repeat?.unit,
      auto: data?.auto,
      // isVariable: data?.isVariable
    };

    console.log(recurringData);

    if (data?.auto) {
      if (data?.type === "Expense" || data?.type === "Transfer") {
        recurringData.fromAsset = {
          connect: { id: assetFromId },
        };
      }
      if (data?.type === "Income" || data?.type === "Transfer") {
        recurringData.toAsset = {
          connect: { id: assetToId },
        };
      }
    }

    if (data?.endDate) {
      recurringData.endDate = data?.endDate;
    }

    console.log("recurring data!", recurringData);

    const recurring = await prisma.recurringTransaction.create({
      data: recurringData,
    });

    const transformedData = {
      amount: amount,
      description: data?.description,
      status: status,
      categoryId: categoryId,
      assetFromId: assetFromId,
      assetToId: assetToId,
      type: data?.type,
      recurringId: recurring?.id,
      date: data?.date,
      userId: userId,
      auto: data?.auto,
    };

    const transaction = await createTransactionRecord(transformedData);

    console.log("transaction!", transaction);
    if (data?.auto && status === "Paid") {
      await createTransactionHistory(transaction?.id, transformedData);
    }
    await createTransactionNotification(transformedData);
    return transaction;
  } catch (err) {
    console.log(err);
    throw new Error("Internal server error");
  }
};

const getRecurring = async (userId, query) => {
  const {
    search,
    pageIndex,
    pageSize,
    Categories,
    startDate,
    endDate,
    type,
    status,
  } = query;

  console.log(type, "type!");

  const page = parseInt(pageIndex) >= 0 ? parseInt(pageIndex) + 1 : 1;
  const size = parseInt(pageSize) > 0 ? parseInt(pageSize) : 10;
  const skip = (page - 1) * size;

  const filters = {
    userId: parseInt(userId),
    ...(startDate && endDate
      ? {
          nextDueDate: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        }
      : {}),
    isActive: true,
    type: type,
  };

  if (search) {
    filters.description = {
      startsWith: search,
      mode: "insensitive",
    };
  }

  // if (status) {
  //   filters.status = {
  //     startsWith: status,
  //   };
  // }

  if (Categories !== undefined) {
    filters.categoryId = {
      in: JSON.parse(Categories),
    };
  }

  const totalCount = await prisma.recurringTransaction.count({
    where: filters,
  });

  const recurring = await prisma.recurringTransaction.findMany({
    where: filters,
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      user: true,
      type: true,
      category: true,
      fromAsset: true,
      toAsset: true,
      description: true,
      amount: true,
      startDate: true,
      nextDueDate: true,
      interval: true,
      unit: true,
      isActive: true,
      endDate: true,
      auto: true,
      generatedExpenses: true,
      generatedIncomes: true,
      generatedTransfers: true,
    },
    skip,
    take: size,
  });

  const totalPages = Math.ceil(totalCount / size);

  return {
    data: recurring,
    totalCount,
    totalPages,
  };
};

const editRecurring = async (id, query) => {
  return "";
};

const cancelRecurring = async (id, query) => {
  return "";
};

const archiveRecurring = async (id, query) => {
  return "";
};

const transactRecurring = async (userId, id, type) => {
  const model = {
    Expense: prisma.expense,
    Income: prisma.income,
    Transfer: prisma.transfer,
  };

  const transactionModel = model[type];
  if (!transactionModel) throw new Error(`Invalid transaction type: ${type}`);

  const transaction = await transactionModel.findUnique({ where: { id: Number(id) } });
  if (!transaction) throw new Error(`${type} with id ${id} not found`);

  const status = await determineTransactionStatus(
    type,
    true,
    Number(transaction.assetId),
    Number(transaction.amount)
  );

  // Balance insufficient
  if (status === "Failed") {
    return {
      success: false,
      message: "Transaction failed due to insufficient balance.",
    };
  }

  /** --- EXPENSE HANDLING --- **/
  if (type === "Expense") {
    // Update status
    await prisma.expense.update({
      where: { id: Number(id) },
      data: { status },
    });

    // Write transaction history using correct fields
    await prisma.transactionHistory.create({
      data: {
        expense: { connect: { id: transaction.id } },
        user: { connect: { id: userId } },
        fromAsset: { connect: { id: transaction.assetId } },
        transactionType: type,
        amount: Number(transaction.amount),
        description: `${transaction.name} — ${moment(transaction.date).format(
          "YYYY-MM-DD"
        )} (Manual retry due to insufficient balance)`,

        date: new Date(), // use now unless you pass a date
      },
    });
  }

  return { success: true, transaction };
};


module.exports = {
  postRecurring,
  getRecurring,
  editRecurring,
  cancelRecurring,
  archiveRecurring,
  transactRecurring,
};
