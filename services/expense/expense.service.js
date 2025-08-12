const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const moment = require("moment");
const { validateCategory } = require("../category.service");
const { validateAsset } = require("../asset.service");
const { uploadFileToS3, deleteFileFromS3 } = require("../s3.service");

const getExpenses = async (userId, query) => {
  const {
    search,
    pageIndex,
    pageSize,
    Categories,
    startDate,
    endDate,
    status,
  } = query;

  const page = parseInt(pageIndex) >= 0 ? parseInt(pageIndex) + 1 : 1;
  const size = parseInt(pageSize) > 0 ? parseInt(pageSize) : 10;
  const skip = (page - 1) * size;

  const filters = {
    userId: parseInt(userId),
    ...(startDate && endDate
      ? {
          date: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        }
      : {}),
    isDeleted: false,
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

  const totalCount = await prisma.expense.count({ where: filters });

  const expenses = await prisma.expense.findMany({
    where: filters,
    orderBy: { date: "desc" },
    skip,
    take: size,
  });

  const detailedExpenses = await Promise.all(
    expenses.map(async (expense) => {
      if (expense?.sourceId !== null) {
        const asset = await prisma.asset.findFirst({
          where: { id: expense.sourceId },
        });
        const category = await prisma.categories.findFirst({
          where: { id: expense.categoryId },
        });
        return { ...expense, asset, category };
      }
      return undefined;
    })
  );

  const filteredExpenses = detailedExpenses.filter(
    (item) => item !== undefined
  );

  const totalPages = Math.ceil(totalCount / size);

  return {
    data: filteredExpenses,
    totalCount,
    totalPages,
  };
};

const postExpense = async (userId, data, file) => {
  const amount = parseInt(data.amount);
  const categoryId = parseInt(data.category?.id);
  const assetId = parseInt(data.source?.id);

  validateCategory(categoryId);
  const asset = validateAsset(assetId, userId);

  // Check if the balance is sufficient
  if (asset.balance < amount) {
    return res.status(400).json({
      success: false,
      message: "Insufficient balance",
    });
  }

  const image = file
    ? await uploadFileToS3(file, "Expense", req.user.id)
    : null;

  console.log("image :", image);

  // Create the expense
  const expense = await prisma.expense.create({
    data: {
      amount: amount,
      description: data.description,
      image: image,
      status: data.date > new Date() ? "Unpaid" : "Paid",
      category: {
        connect: {
          id: categoryId,
        },
      },
      asset: {
        connect: {
          id: assetId,
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

  // Create a transaction history record
  await prisma.transactionHistory.create({
    data: {
      expenseId: expense.id,
      userId: userId,
      fromAssetId: assetId,
      transactionType: "Expense",
      amount: amount,
      description: data.description,
      date: data.date,
    },
  });

  return expense;
};

const updateExpense = async (userId, data, file, id) => {
  console.log("params:", id);
  console.log("category id",data);

  try {
    const amount = parseInt(data?.amount);
    const categoryId = parseInt(data.category);
    const assetId = parseInt(data.source);
    const expense = await prisma.expense.findFirst({
      where: {
        id: parseInt(id),
      },
    });

    if (!expense) {
      return res.status(500).json({
        error: "Expense doesn't exist in record",
      });
    }

    let image;

    if (file) {
      image = await uploadFileToS3(file, "Expense", userId);
      if (expense?.image) {
        await deleteFileFromS3(expense?.image);
      }
    } else if (data?.image) {
      image = expense?.image;
    } else {
      image = await deleteFileFromS3(expense?.image);
    }

    console.log("image: ", image, id);

    const expenseUpdate = await prisma.expense.update({
      where: { id: parseInt(id) },
      data: {
        amount: amount,
        description: data.description,
        recurring: data.recurring,
        image: image,
        status: data.date > new Date() ? "Unpaid" : "Paid",
        category: {
          connect: {
            id: categoryId,
          },
        },
        asset: {
          connect: {
            id: assetId,
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

    console.log(expenseUpdate);

    // Fetch the transaction history record related to the expense
    const transaction = await prisma.transactionHistory.findFirst({
      where: { expenseId: parseInt(id) }, // Ensure expenseId is properly converted to an integer
    });

    await prisma.transactionHistory.update({
      where: { id: parseInt(transaction?.id) },
      data: {
        amount: parseInt(data.amount),
        description: data.description,
        date: data.date,
        updatedAt: new Date(),
      },
    });

    console.log("return");

    return expenseUpdate;
  } catch (err) {
    console.log(err);
    return err;
  }
};

module.exports = {
  getExpenses,
  postExpense,
  updateExpense,
};
