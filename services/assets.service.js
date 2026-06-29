import { PrismaClient } from "@prisma/client";
import moment from "moment";

const prisma = new PrismaClient();

/*
|--------------------------------------------------------------------------
| Validate Asset
|--------------------------------------------------------------------------
*/
export const validateAsset = async (assetId, userId) => {
  try {
    const asset = await prisma.asset.findFirst({
      where: {
        id: Number(assetId),
        userId: Number(userId),
      },
    });

    if (!asset) {
      throw new Error("Asset not found");
    }

    return asset;
  } catch (err) {
    console.error("validateAsset error:", err);
    throw err;
  }
};

/*
|--------------------------------------------------------------------------
| Create Asset
|--------------------------------------------------------------------------
*/
export const createAsset = async (
  name,
  balance,
  currency,
  type,
  creditLimit,
  color,
  icon,
  userId,
) => {
  try {
    return await prisma.asset.create({
      data: {
        name,
        balance: parseFloat(balance),

        ...(type && { type: type }),
        ...(currency && { currency }),

        ...(creditLimit && {
          creditLimit: Number(creditLimit),
        }),

        ...(color && {
          color,
        }),

        ...(icon && {
          icon,
        }),

        user: {
          connect: {
            id: Number(userId),
          },
        },
      },
    });
  } catch (err) {
    console.error("createAsset error:", err);
    throw new Error("Internal Server Error");
  }
};

/*
|--------------------------------------------------------------------------
| Get Asset Summary (with trend)
|--------------------------------------------------------------------------
*/
export const getAsset = async (userId, id) => {
  try {
    const lastMonth = moment()
      .subtract(1, "month")
      .endOf("month")
      .toDate();

    const current = await getAssetBalance(userId, id);
    const previous = await getAssetBalance(userId, id, lastMonth);

    const currentBalance = current?.remainingBalance ?? 0;
    const prevBalance = previous?.remainingBalance ?? 0;

    const trend =
      prevBalance === 0
        ? 0
        : Number(
          (
            ((currentBalance - prevBalance) / prevBalance) *
            100
          ).toFixed(2)
        );

    return {
      data: current.data,
      balance: currentBalance,
      trend,
    };
  } catch (err) {
    console.error("getAsset error:", err);
    throw new Error("Internal Server Error");
  }
};

/*
|--------------------------------------------------------------------------
| Get Asset Balance (Core Calculation)
|--------------------------------------------------------------------------
*/
export const getAssetBalance = async (userId, id, date) => {
  try {
    const dateFilter = date
      ? {
        date: {
          lte: new Date(date),
        },
      }
      : {};

    const assets = await prisma.asset.findMany({
      where: {
        userId: Number(userId),
        ...(id ? { id: Number(id) } : {}),
      },
      select: {
        id: true,
        name: true,
        balance: true,
        incomes: {
          where: {
            isActive: true,
            ...dateFilter,
          },
        },
        expenses: {
          where: {
            isActive: true,
            ...dateFilter,
          },
        },
        sentTransfers: {
          where: {
            isActive: true,
            ...dateFilter,
          },
        },
        receivedTransfers: {
          where: {
            isActive: true,
            ...dateFilter,
          },
        },
      },
    });

    const data = assets.map((asset) => {
      const totalExpenses = asset.expenses.reduce(
        (sum, tx) => sum + Number(tx.amount),
        0
      );

      const totalIncomes = asset.incomes.reduce(
        (sum, tx) => sum + Number(tx.amount),
        0
      );

      const totalTransferOut = asset.sentTransfers.reduce(
        (sum, tx) => sum + Number(tx.amount),
        0
      );

      const totalTransferIn = asset.receivedTransfers.reduce(
        (sum, tx) => sum + Number(tx.amount),
        0
      );

      const remainingBalance =
        Number(asset.balance) +
        totalIncomes -
        totalExpenses -
        totalTransferOut +
        totalTransferIn;

      return {
        ...asset,
        totalExpenses,
        totalIncomes,
        totalTransferOut,
        totalTransferIn,
        remainingBalance,
      };
    });

    const totalRemainingBalance = data.reduce(
      (sum, asset) => sum + asset.remainingBalance,
      0
    );

    return {
      data,
      remainingBalance: totalRemainingBalance,
    };
  } catch (err) {
    console.error("getAssetBalance error:", err);
    throw new Error("Internal Server Error");
  }
};

const sumAmounts = (transactions) =>
  transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);