const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const getHistory = async (userId) => {
  try {
    const expense = await prisma.expense.findMany({
      where: { isActive: true, status: "Paid", userId },
      select: {
        id: true,
        amount: true,
        date: true,
        assetId: true,
        description: true,
        category: {
          select: {
            name: true,
            icon: true,
          },
        },
      },
    });

    console.log("expense: !", expense);
    const income = await prisma.income.findMany({
      where: {
        isActive: true,
        status: "Received",
        userId,
      },
      select: {
        id: true,
        amount: true,
        description: true,
        date: true,
        assetId: true,
        category: {
          select: {
            name: true,
            icon: true,
          },
        },
      },
    });
    console.log("income: !", income);
    const transfer = await prisma.transfer.findMany({
      where: {
        isActive: true,
        // status: "Completed",
        userId,
      },
      select: {
        id: true,
        amount: true,
        date: true,
        fromAssetId: true,
        toAssetId: true,
        // category: {
        //   select: {
        //     name: true,
        //     icon: true,
        //   },
        // },
      },
    });
    console.log("transfer: !", transfer);

    const transaction = [...expense, ...income, ...transfer];
    const sorted = transaction.sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    );
    return sorted;
  } catch (err) {
    console.log(err);
    return err;
  }
};

module.exports = {
  getHistory,
};
