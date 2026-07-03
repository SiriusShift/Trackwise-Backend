import { PrismaClient } from "@prisma/client";
import moment from "moment";

import { validateCategory } from "./categories.service.js";
// import {
//   createTransactionHistory,
//   createTransactionNotification,
//   createTransactionRecord,
// } from "./transactions.service.js";

import { determineTransactionStatus } from "../utils/transaction.utils.js";

const prisma = new PrismaClient();

/*
|--------------------------------------------------------------------------
| Create Recurring Transaction
|--------------------------------------------------------------------------
*/
export const postRecurring = async (userId, data) => {
  console.log(data, "DATA!")
  const amount = Number(data.amount);
  const categoryId = Number(data.category);
  const assetFromId = Number(data?.account);
  const assetToId = Number(data?.to?.id);
  const isAuto = data.behaviour === "AUTO_LOG";
  const type = data?.type;
  try {
    const status = await determineTransactionStatus(
      data?.type,
      data?.behaviour,
      assetFromId,
      amount,
      userId,
    );

    await validateCategory(categoryId);

    const recurringData = {
      user: { connect: { id: userId } },
      type: data?.type,
      category: { connect: { id: categoryId } },
      amount,
      description: data?.description,
      startDate: data?.date,
      nextDueDate: moment(data?.date)
        .add(Number(data.every), data.frequency)
        .toDate(),
      interval: Number(data?.every),
      unit: data?.frequency,
      behaviour: data?.behaviour,
    };

    if (type === "Expense") {
      recurringData.fromAsset = {
        connect: { id: assetFromId },
      };
    }

    if (type === "Income") {
      recurringData.toAsset = {
        connect: { id: assetToId },
      };
    }

    if (type === "Transfer") {
      recurringData.fromAsset = {
        connect: { id: assetFromId },
      };

      recurringData.toAsset = {
        connect: { id: assetToId },
      };
    }

    if (data?.endDate) {
      recurringData.endDate = data.endDate;
    }

    const recurring = await prisma.recurringTransaction.create({
      data: recurringData,
    });

    const transformedData = {
      amount,
      description: data.description,
      status,
      date: data.date,

      user: {
        connect: { id: userId },
      },

      category: {
        connect: { id: categoryId },
      },

      recurringTemplate: {
        connect: { id: recurring.id },
      },
    };

    if (type === "Expense") {
      transformedData.asset = {
        connect: { id: assetFromId },
      };
    }

    if (type === "Income") {
      transformedData.asset = {
        connect: { id: assetToId },
      };
    }

    if (type === "Transfer") {
      transformedData.fromAsset = {
        connect: { id: assetFromId },
      };

      transformedData.toAsset = {
        connect: { id: assetToId },
      };
    }

    const modelMap = {
      Expense: prisma.expense,
      Income: prisma.income,
      Transfer: prisma.transfer,
    };

    const model = modelMap[type];

    if (!model) {
      throw new Error("Invalid transaction type");
    }
    let transaction = null;

    if (isAuto) {
      if (isAuto && moment(data.date).isSame(moment(), "day")) {
        transaction = await model.create({
          data: transformedData,
        });
      }
    }

    return transaction;
  } catch (err) {
    console.error("postRecurring error:", err);
    throw new Error("Internal server error");
  }
};

/*
|--------------------------------------------------------------------------
| Get Recurring Transactions
|--------------------------------------------------------------------------
*/
export const getRecurring = async (userId, query) => {
  const { search, pageIndex, pageSize, Categories, startDate, endDate, type } =
    query;

  const page = Number(pageIndex) >= 0 ? Number(pageIndex) + 1 : 1;
  const size = Number(pageSize) > 0 ? Number(pageSize) : 10;
  const skip = (page - 1) * size;

  const filters = {
    userId: Number(userId),
    isActive: true,
    ...(type ? { type } : {}),
    ...(startDate && endDate
      ? {
        nextDueDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }
      : {}),
  };

  if (search) {
    filters.description = {
      startsWith: search,
      mode: "insensitive",
    };
  }

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
    skip,
    take: size,
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
      behaviour: true,
      generatedExpenses: true,
      generatedIncomes: true,
      generatedTransfers: true,
    },
  });

  return {
    data: recurring,
    totalCount,
    totalPages: Math.ceil(totalCount / size),
  };
};

/*
|--------------------------------------------------------------------------
| Edit Recurring (TODO)
|--------------------------------------------------------------------------
*/
export const editRecurring = async () => {
  return "";
};

/*
|--------------------------------------------------------------------------
| Cancel Recurring
|--------------------------------------------------------------------------
*/
export const cancelRecurring = async (id) => {
  try {
    await prisma.recurringTransaction.update({
      where: {
        id: Number(id),
      },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    });

    return { success: true };
  } catch (err) {
    console.error("cancelRecurring error:", err);
    throw new Error("Internal server error");
  }
};

/*
|--------------------------------------------------------------------------
| Manual Transaction Trigger
|--------------------------------------------------------------------------
*/
export const transactRecurring = async (userId, id, type) => {
  const modelMap = {
    Expense: prisma.expense,
    Income: prisma.income,
    Transfer: prisma.transfer,
  };

  const model = modelMap[type];
  if (!model) throw new Error(`Invalid transaction type: ${type}`);

  const transaction = await model.findUnique({
    where: { id: Number(id) },
  });

  if (!transaction) {
    throw new Error(`${type} with id ${id} not found`);
  }

  const assetId = transaction.assetId;
  const amount = transaction.amount;

  const status = await determineTransactionStatus(
    type,
    true,
    assetId,
    amount,
    userId,
  );

  if (status === "Failed") {
    return {
      success: false,
      message: "Transaction failed due to insufficient balance.",
    };
  }

  if (type === "Expense") {
    await prisma.expense.update({
      where: { id: Number(id) },
      data: { status },
    });

    await prisma.transactionHistory.create({
      data: {
        expense: { connect: { id: transaction.id } },
        user: { connect: { id: userId } },
        fromAsset: { connect: { id: assetId } },
        transactionType: type,
        amount: Number(amount),
        description: `${transaction.description} — ${moment(
          transaction.date,
        ).format("YYYY-MM-DD")} (Manual retry due to insufficient balance)`,
        date: new Date(),
      },
    });
  }

  return {
    success: true,
    transaction,
  };
};


export const transactBill = async (id) => {
  try {
    const recurring = await prisma.recurringTransaction.findFirst({
      where: {
        id: Number(id)
      }
    })
    await prisma.recurringTransaction.update({
      where: {
        id: Number(id)
      },
      data: {
        nextDueDate: moment(recurring?.nextDueDate).add(1, "month")
      }
    })
    return {
      success: true,
    };
  } catch (err) {
    console.error("Transact bill error:", err);
    throw new Error("Internal server error");
  }

};
