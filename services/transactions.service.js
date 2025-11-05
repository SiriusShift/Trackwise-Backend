const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

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

        let newStatus = "Unpaid";
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
      where: { id: Number(id) },
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

        if (totalPaid === 0) newStatus = "Unpaid";
        else if (totalPaid < expense.amount) newStatus = "Partial";
        else if (totalPaid >= expense.amount) newStatus = "Paid";

        await prisma.expense.update({
          where: { id: expense.id },
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

module.exports = {
  getHistory,
  editHistory,
  deleteHistory,
};
