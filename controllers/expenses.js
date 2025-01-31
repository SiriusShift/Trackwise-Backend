const { PrismaClient } = require("@prisma/client");
// const { skip } = require("@prisma/client/runtime/library");
const prisma = new PrismaClient();

const postExpense = async (req, res, next) => {
  try {
    console.log("date", req.body.date);
    // Check if the expense already exists (you can customize the uniqueness criteria)
    const existingExpense = await prisma.expense.findFirst({
      where: {
        amount: req.body.amount,
        description: req.body.description,
        categoryId: req.body.category,
        date: req.body.date,
        userId: req.user.id, // Assuming user is authenticated and available via req.user.id
      },
    });

    // If an expense with the same details already exists, return an error
    if (existingExpense) {
      return res.status(400).json({
        success: false,
        message: "Duplicate expense found. This expense already exists.",
      });
    }

    // Ensure the category exists
    const category = await prisma.category.findFirst({
      where: {
        id: req.body.category,
      },
    });

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Category not found",
      });
    }

    // Ensure the source asset exists
    const asset = await prisma.asset.findFirst({
      where: {
        id: req.body.source,
      },
    });

    if (!asset) {
      return res.status(400).json({
        success: false,
        message: "Asset not found",
      });
    }

    // Check if the balance is sufficient
    if (asset.balance < req.body.amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
    }

    const balance = req.body.assetBalance - req.body.amount;
    const month = new Date(req.body.date).getMonth() + 1;
    const year = new Date(req.body.date).getFullYear();

    // Create the expense
    const expense = await prisma.expense.create({
      data: {
        amount: req.body.amount,
        description: req.body.description,
        category: {
          connect: {
            id: req.body.category,
          },
        },
        source: {
          connect: {
            id: req.body.source,
          },
        },
        date: req.body.date,
        month: month,
        year: year,
        recipient: req.body.recipient,
        user: {
          connect: {
            id: req.user.id,
          },
        },
      },
    });

    // Create a transaction history record
    await prisma.transactionHistory.create({
      data: {
        expenseId: expense.id,
        userId: req.user.id,
        assetId: req.body.source,
        transactionType: "Expense",
        amount: req.body.amount,
        description: req.body.description,
        date: req.body.date,
        balanceAfter: balance,
      },
    });

    // Respond with success message
    res.status(200).json({
      success: true,
      message: "Expense created successfully",
      data: expense,
    });
  } catch (err) {
    console.error("Error while creating expense", err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

const updateExpense = async (req, res, next) => {
  const { id } = req.params;
  console.log(req.body);
  try {
    const expense = await prisma.expense.update({
      where: { id: parseInt(id) },
      data: {
        amount: req.body.amount,
        description: req.body.description,
        category: {
          connect: {
            id: req.body.category.id,
          },
        },
        ...(req.body.source && {
          source: { connect: { id: req.body.source.id } },
        }),
        ...(req.body.frequency && {
          frequency: { connect: { id: req.body.frequency.id } },
        }),
        date: req.body.date,
        recipient: req.body.recipient,
        ...(req.body.startDate && {
          status:
            new Date() > new Date(req.body.startDate) ? "Overdue" : "Unpaid",
        }),
      },
    });

    res.status(200).json({
      success: true,
      message: "Expense updated successfully",
      data: expense,
    });
  } catch (err) {
    console.log("Error while updating expense", err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

const deleteExpense = async (req, res, next) => {
  const { id } = req.params;
  try {
    await prisma.expense.update({
      where: { id: parseInt(id) },
      data: {
        isDeleted: true,
        transactionHistory: {
          updateMany: {
            where: { expenseId: parseInt(id) },
            data: { isDeleted: true },
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Expense deleted successfully",
    });
  } catch (err) {
    console.log("Error while deleting expense", err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

const postRecurringExpense = async (req, res, next) => {
  try {
    await prisma.category
      .findFirst({
        where: {
          id: req.body.category.id,
        },
      })
      .then((category) => {
        if (!category) {
          res.status(400).json({
            success: false,
            message: "Category not found",
          });
        }
      });

    console.log(new Date(), new Date(req.body.startDate));

    const data = await prisma.expense.create({
      data: {
        amount: req.body.amount, // Amount is required
        description: req.body.description, // Description is required
        category: {
          connect: {
            id: req.body.category, // Category is required and connected via id
          },
        },
        status:
          new Date() > new Date(req.body.startDate) ? "Overdue" : "Unpaid",
        date: req.body.startDate, // Start Date is required
        frequency: {
          connect: {
            id: req.body.freqId,
          },
        },
        isRecurring: true,
        recipient: req.body.recipient,
        user: {
          connect: {
            id: req.body.userId, // User is required and connected via user id
          },
        },
      },
    });
    res.status(200).json({
      success: true,
      message: "Recurring expense created successfully",
      data: data,
    });
  } catch (err) {
    console.error("Error while fetching expenses", err);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

const getExpenses = async (req, res, next) => {
  const { Search, pageIndex, pageSize, Categories, startDate, endDate } =
    req.query;

  if (!req.user.id) {
    return res.status(400).json({
      success: false,
      message: "User ID is required",
    });
  }

  const page = parseInt(pageIndex) >= 0 ? parseInt(pageIndex) + 1 : 1;
  const size = parseInt(pageSize) > 0 ? parseInt(pageSize) : 10;
  const skip = (page - 1) * size;

  try {
    const filters = {
      userId: parseInt(req.user.id),
      frequency: null,
      date: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
      isDeleted: false,
    };

    if (Search) {
      filters.description = {
        startsWith: Search,
        mode: "insensitive",
      };
    }

    if (Categories !== undefined) {
      filters.categoryId = {
        in: JSON.parse(Categories),
      };
    }

    console.log("Filters applied:", filters);

    const totalCount = await prisma.expense.count({ where: filters });

    // Fetch grouped expenses by month

    const expenses = await prisma.expense.findMany({
      where: filters,
      orderBy: { date: "desc" },
      skip,
      take: size,
    });

    const totalPages = Math.ceil(totalCount / size);

    const detailedExpenses = await Promise.all(
      expenses.map(async (expense) => {
        if (expense?.sourceId !== null) {
          const asset = await prisma.asset.findFirst({
            where: { id: expense.sourceId },
          });
          const category = await prisma.category.findFirst({
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

    return res.status(200).json({
      success: true,
      message: "Expenses fetched successfully",
      data: filteredExpenses,
      totalCount,
      totalPages,
    });
  } catch (err) {
    console.error("Error while fetching expenses:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

const getDetailedExpenses = async (req, res, next) => {
  const { startDate, endDate } = req.query;

  try {
    const filters = {
      userId: parseInt(req.user.id),
      frequency: null,
      date: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
      isDeleted: false,
    };
    const groupedExpenses = await prisma.expense.groupBy({
      by: [
        "year", // Custom field for the year
        "month", // Custom field for the month
      ],
      where: {
        userId: parseInt(req.user.id),
        frequency: null,
        date: {
          gte: (() => {
            const date = new Date(startDate);
            date.setMonth(date.getMonth() - 1); // Subtract 1 month
            return date;
          })(),
          lte: new Date(endDate),
        },
      },
      _sum: { amount: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });

    const trend = (
      ((groupedExpenses[1]?._sum?.amount - groupedExpenses[0]?._sum?.amount) /
        groupedExpenses[0]?._sum?.amount) *
      100
    ).toFixed(2);

    const categoryExpenses = await prisma.expense.groupBy({
      by: ["categoryId"],
      where: filters,
      _sum: { amount: true },
    });

    const detailedCategoryExpenses = await Promise.all(
      categoryExpenses.map(async (item) => {
        const category = await prisma.category.findFirst({
          where: { id: item.categoryId },
        });
        return {
          categoryId: item.categoryId,
          categoryName: category?.name || "Unknown",
          total: item._sum.amount || 0,
        };
      })
    );

    const totalExpense = await prisma.expense.aggregate({
      where: filters,
      _sum: { amount: true },
    });

    return res.status(200).json({
      success: true,
      message: "Detailed expenses fetched successfully",
      data: {
        trend,
        categoryExpenses: detailedCategoryExpenses,
        totalExpense: totalExpense._sum.amount || 0,
      },
    });
  } catch (err) {
    console.error("Error while fetching detailed expenses:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

const getRecurringExpenses = async (req, res, next) => {
  const { Search, startDate, endDate, Categories, Status } = req.query;

  const page = parseInt(req.query.pageIndex) + 1;
  const pageSize = parseInt(req.query.pageSize);

  const skip = (page - 1) * pageSize;

  try {
    const filters = {
      userId: parseInt(req.user.id),
      isRecurring: true,
      date: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    };
    // Fetch total count of matching expenses
    const totalCount = await prisma.expense.count({
      where: filters,
    });

    if (Categories !== undefined) {
      filters.categoryId = {
        in: JSON.parse(Categories),
      };
    }

    if (Search) {
      filters.description = {
        startsWith: Search, // Use `startsWith` for matching the beginning of the string
        mode: "insensitive", // Case-insensitive search
      };
    }

    if (Status !== undefined) {
      filters.status = Status; // Assign the value directly to filters.status
    }

    console.log("count", totalCount);

    // Fetch paginated expenses
    const recurringExpenses = await prisma.expense.findMany({
      where: filters,
      // orderBy: {
      //   date: "desc",
      // },
      skip: skip,
      take: pageSize,
    });

    const totalPages = Math.ceil(totalCount / pageSize);
    // console.log("total pages: ", totalPages, totalCount);

    if (recurringExpenses.length < 1) {
      return res.status(200).json({
        success: false,
        message: "User doesn't have existing recurring expenses",
        data: [],
        totalCount,
        totalPages,
      });
    }

    // Fetch additional details for each expense
    const detailedExpenses = await Promise.all(
      recurringExpenses.map(async (expense) => {
        const category = await prisma.category.findFirst({
          where: { id: expense.categoryId },
        });
        const frequency = await prisma.frequency.findFirst({
          where: { id: expense.frequencyId },
        });

        return {
          ...expense,
          category,
          frequency,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "Expenses fetched successfully",
      data: detailedExpenses,
      totalCount,
      totalPages,
    });
  } catch (err) {
    console.error("Error while fetching expenses", err);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

const addExpenseLimit = async (req, res, next) => {
  try {
    const categoryId = parseInt(req.params.id); // Extracts 'id' from the URL
    const { amount } = req.body;
    console.log(amount);
    await prisma.category.update({
      where: {
        id: categoryId,
      },
      data: {
        limit: amount,
      },
    });

    res.status(200).json({
      success: true,
      message: "Expense limit added successfully",
    });
  } catch (err) {
    console.error("Error while fetching expenses", err);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

const getAllExpenseLimit = async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: {
        limit: { not: null }, // Filter categories that have a limit
      },
      select: {
        id: true,
        name: true,
        icon: true,
        limit: true,
        expenses: {
          select: {
            amount: true,
          },
        },
      },
    });

    // Calculate total expenses per category
    const result = categories.map((category) => {
      const totalExpense = category.expenses.reduce((sum, expense) => sum + expense.amount, 0);
      return {
        id: category.id,
        name: category.name,
        icon: category.icon,
        limit: category.limit,
        totalExpense: totalExpense,
      };
    });

    res.status(200).json({
      success: true,
      message: "Expense limit fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};



module.exports = {
  postExpense,
  getExpenses,
  postRecurringExpense,
  getRecurringExpenses,
  addExpenseLimit,
  getDetailedExpenses,
  deleteExpense,
  updateExpense,
  getAllExpenseLimit
};
