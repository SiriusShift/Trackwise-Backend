const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const moment = require("moment");
const {validateCategory} = require("../category.service")
const {validateAsset} = require("../asset.service")

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

  validateCategory(categoryId)
  const asset = validateAsset(assetId, userId)

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
  const amount = parseInt(data?.amount);
  const categoryId = parseInt(data.category?.id);
  const assetId = parseInt(data.source?.id);
  console.log(req.body);
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

  if (req.file) {
    image = await uploadFileToS3(file, "Expense", userId);
    await deleteFileFromS3(expense?.image);
  } else if (req.body?.image) {
    image = expense?.image;
  } else {
    image = await deleteFileFromS3(expense?.image);
  }

  console.log("image: ", image);

  const expenseUpdate = await prisma.expense.update({
    where: { id: parseInt(id) },
    data: {
      amount: amount,
      description: req.body.description,
      recurring: req.body.recurring,
      image: image,
      status: req.body.date > new Date() ? "Unpaid" : "Paid",
      category: {
        connect: {
          id: assetId,
        },
      },
      asset: {
        connect: {
          id: categoryId,
        },
      },
      date: req.body.date,
      user: {
        connect: {
          id: req.user.id,
        },
      },
    },
  });

  // Fetch the transaction history record related to the expense
  const transaction = await prisma.transactionHistory.findFirst({
    where: { expenseId: parseInt(id) }, // Ensure expenseId is properly converted to an integer
  });

  await prisma.transactionHistory.update({
    where: { id: parseInt(transaction?.id) },
    data: {
      amount: parseInt(req.body.amount),
      description: req.body.description,
      date: req.body.date,
      updatedAt: new Date(),
    },
  });

  return expenseUpdate;
};

module.exports = {
  getExpenses,
  postExpense,
  updateExpense
};
