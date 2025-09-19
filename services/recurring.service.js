const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { validateCategory } = require("./categories.service");
const { connect } = require("../routes/emails.routes");
const { validateAsset } = require("./assets.service");

const postRecurring = async (userId, data) => {
  const amount = parseInt(data.amount);
  const categoryId = parseInt(data.category);
  const assetFromId = parseInt(data?.from);
  const assetToId = parseInt(data?.to);
  try {
    await validateCategory(categoryId);

    const recurringData = {
      user: { connect: { id: userId } },
      type: data?.type,
      category: { connect: { id: categoryId } },
      amount: data?.amount,
      description: data?.description,
      startDate: new Date(),
      nextDueDate: data?.date,
      interval: data?.repeat?.interval,
      unit: data?.repeat?.unit,
      auto: data?.auto,
      // isVariable: data?.isVariable
    };

    console.log(recurringData);

    if (data?.auto) {
      console.log("test3");
      if (data?.type !== "Income") {
        const asset = await validateAsset(assetFromId, userId);

        // Check if the balance is sufficient
        if (asset.balance < amount) {
          throw new Error("Insufficient balance");
        }
      }

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

    let transaction;

    if (data?.type === "Expense") {
      transaction = await prisma.expense.create({
        data: {
          amount: amount,
          description: data.description,
          status: data?.auto ? "Paid" : "Pending",
          category: {
            connect: {
              id: categoryId,
            },
          },
          ...(assetFromId &&
            data?.auto && {
              asset: {
                connect: {
                  id: assetFromId,
                },
              },
            }),
          recurringTemplate: {
            connect: {
              id: recurring?.id,
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
    } else if (data?.type === "Income") {
      transaction = await prisma.income.create({
        data: {
          amount: amount,
          description: data.description,
          image: image,
          status: data?.auto ? "Paid" : "Pending",
          category: {
            connect: {
              id: categoryId,
            },
          },
          ...(assetToId &&
            data?.auto && {
              asset: {
                connect: {
                  id: assetFromId,
                },
              },
            }),
          recurringTemplate: {
            connect: {
              id: recurring?.id,
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
    }
    if (data?.auto) {
      await prisma.transactionHistory.create({
        data: {
          ...(data?.type === "Expense" && {
            expense: {
              connect: {
                id: transaction.id,
              },
            },
          }),
          ...(data?.type === "Income" && {
            income: {
              connect: {
                id: transaction.id,
              },
            },
          }),
          ...(data?.type === "Transfer" && {
            transfer: {
              connect: {
                id: transaction.id,
              },
            },
          }),
          user: {
            connect: {
              id: userId,
            },
          },
          ...(data?.type !== "Income" && {
            fromAsset: {
              connect: {
                id: assetFromId,
              },
            },
          }),
          ...(data?.type !== "Expense" && {
            toAsset: {
              connect: {
                id: assetToId,
              },
            },
          }),
          transactionType: data?.type,
          amount: amount,
          description: data.description,
          date: new Date(),
        },
      });
    }
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

  console.log(type, "type!")

  const page = parseInt(pageIndex) >= 0 ? parseInt(pageIndex) + 1 : 1;
  const size = parseInt(pageSize) > 0 ? parseInt(pageSize) : 10;
  const skip = (page - 1) * size;

  const filters = {
    userId: parseInt(userId),
    ...(startDate && endDate
      ? {
          startDate: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        }
      : {}),
    isActive: true,
    type: type
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

  const totalCount = await prisma.recurringTransaction.count({
    where: filters,
  });

  const recurring = await prisma.recurringTransaction.findMany({
    where: filters,
    orderBy: { startDate: "desc" },
    skip,
    take: size,
  });

  const detailedRecurring = await Promise.all(
    recurring.map(async (transaction) => {
      console.log("transaction:", transaction);
      let asset;
      let category;
      if (transaction?.fromAssetId !== null) {
        asset = await prisma.asset.findFirst({
          where: { id: transaction.fromAssetId },
        });
      }
      if (transaction?.toAssetId !== null) {
        asset = await prisma.asset.findFirst({
          where: { id: transaction.toAssetId },
        });
      }
      if (transaction?.categoryId !== null) {
        category = await prisma.categories.findFirst({
          where: { id: transaction.categoryId },
        });
      }
      console.log("test")
      return { ...transaction, asset, category };
    })
  );
  console.log(detailedRecurring)

  const filteredRecurring = detailedRecurring.filter(
    (item) => item !== undefined
  );
  console.log(filteredRecurring)

  const totalPages = Math.ceil(totalCount / size);

  return {
    data: filteredRecurring,
    totalCount,
    totalPages,
  };
};



module.exports = {
  postRecurring,
  getRecurring
};
