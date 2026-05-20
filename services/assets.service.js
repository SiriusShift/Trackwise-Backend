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
      .subtract(1, "months")
      .endOf("month")
      .toDate();

    const current = await getAssetBalance(userId, id);
    const previous = await getAssetBalance(userId, id, lastMonth);

    const prevBalance = previous?.balance || 0;

    const trend =
      prevBalance === 0
        ? 0
        : (
          ((current.balance - prevBalance) / prevBalance) *
          100
        ).toFixed(2);

    return {
      data: current.data,
      balance: current.balance,
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
            ...(date ? { date: { lte: date } } : {}),
          },
        },
        expenses: {
          where: {
            isActive: true,
            ...(date ? { date: { lte: date } } : {}),
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

      const remainingBalance =
        Number(asset.balance) + totalIncomes - totalExpenses;

      return {
        ...asset,
        totalExpenses,
        totalIncomes,
        remainingBalance,
      };
    });

    const totalRemainingBalance = data.reduce(
      (sum, asset) => sum + asset.remainingBalance,
      0
    );

    return {
      data,
      balance: totalRemainingBalance,
    };
  } catch (err) {
    console.error("getAssetBalance error:", err);
    throw new Error("Internal Server Error");
  }
};