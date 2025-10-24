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
    console.log("Test ID", id);

    const amount = Number(data?.amount);
    const categoryId = parseInt(data.category);
    const assetFrom = parseInt(data.from);
    const assetTo = parseInt(data.to);

    const history = await validateTransactionHistory(id);
    let image;

    console.log("Test1");

    if (file) {
      image = await uploadFileToS3(file, "Expense", userId);
      if (history?.image) {
        console.log("delete image");
        await deleteFileFromS3(history?.image);
      }
    } else if (data?.image) {
      image = history?.image;
    } else {
      image = await deleteFileFromS3(history?.image);
    }

    const transaction = prisma.transactionHistory.update({
      where: { id: parseInt(id) },
      data: {
        amount: amount,
        description: data.description,
        ...(assetFrom && {
          fromAsset: {
            connect: {
              id: assetFrom,
            },
          },
        }),
        ...(assetTo && {
          toAsset: {
            connect: {
              id: assetTo,
            },
          },
        }),
        date: data.date,
        updatedAt: new Date(),
        user: {
          connect: {
            id: userId,
          },
        },
      },
    });

    return transaction;
  } catch (err) {
    console.log(err);
    throw new Error("Internal server error");
  }
};

module.exports = {
  getHistory,
  editHistory,
};
