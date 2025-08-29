const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const getHistory = async (userId) => {
  try {
    const transactions = await prisma.transactionHistory.findMany({
      where: {
        isActive: true,
        userId: userId,
        OR: [
          {
            transactionType: "Expense",
            expense: {
              status: "Paid",
            },
          },
          {
            transactionType: "Income",
            income: {
              status: "Received",
            },
          },
        ],
      },
      select: {
        id: true,
        transactionType: true,
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
          status: item?.expense?.status
        }),
        ...(item?.income && {
          category: {
            name: item?.income?.category?.name,
            icon: item?.income?.category?.icon,
          },
                    status: item?.income?.status

        }),
        // ...(item?.transfer && {
        //   category: {
        //     name: item?.transfer?.category?.name,
        //     icon: item?.transfer?.category?.icon,
        //   },
        // }),
      };
    });

    // const transaction = [...expense, ...income, ...transfer];
    // const sorted = transaction.sort(
    //   (a, b) => b.date.getTime() - a.date.getTime()
    // );
    return filter;
  } catch (err) {
    console.log(err);
    return err;
  }
};

module.exports = {
  getHistory,
};
