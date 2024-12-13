const { PrismaClient } = require("@prisma/client");
const { skip } = require("@prisma/client/runtime/library");
const prisma = new PrismaClient();

const postExpense = async (req, res, next) => {
  console.log("hello", req.body);
  try {
    await prisma.category
      .findFirst({
        where: {
          id: req.body.category,
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

      console.log("source:",req.body.source);

    await prisma.asset
      .findFirst({
        where: {
          id: req.body.source,
        },
      })
      .then(async (asset) => {
        if(!asset) {
          return res.status(400).json({
            success: false,
            message: "Asset not found",
          });
        }
      });

    const data = await prisma.expense.create({
      data: {
        amount: req.body.amount, // Amount is required
        description: req.body.description, // Description is required
        category: {
          connect: {
            id: req.body.category, // Category is required and connected via id
          },
        },
        source: {
          connect: {
            id: req.body.source, // Source is required and connected via id
          },
        },
        recurring: false,
        date: req.body.date, // Date is required
        status: req.body.status ? req.body.status : "Paid",
        recipient: req.body.recipient,
        user: {
          connect: {
            id: req.user.id, // User is required and connected via user id
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Expense created successfully",
      data: data,
    });
  } catch (err) {
    console.log("Error while creating expense", err);
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
        id: req.body.category,
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

    if(req.body.status === "Paid") {
      await prisma.recurringExpense.create({
        data: {
          amount: req.body.amount, // Amount is required
          description: req.body.description, // Description is required
          category: {
            connect: {
              id: req.body.category, // Category is required and connected via id
            },
          },
          startDate: req.body.date, // Date is required
          status: req.body.status,
          user: {
            connect: {
              id: req.user.id, // User is required and connected via user id
            },
          }
        },
      });
    }
  }catch(err){
    console.error("Error while fetching expenses", err);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

const getExpenses = async (req, res, next) => {
  const { userId, active } = req.query;
  const recurring = active === "All" ? false : true;

  const page = parseInt(req.query.pageIndex) + 1;
  console.log(page);
  const pageSize = parseInt(req.query.pageSize);

  const skip = (page - 1) * pageSize;

  try {
    // Fetch total count of matching expenses
    const totalCount = await prisma.expense.count({
      where: {
        userId: parseInt(userId),
        recurring: recurring,
      },
    });

    // Fetch paginated expenses
    const expenses = await prisma.expense.findMany({
      where: {
        userId: parseInt(userId),
        recurring: recurring,
      },
      orderBy: {
        date: "desc",
      },
      skip: skip,
      take: pageSize,
    });

    const totalPages = Math.ceil(totalCount / pageSize);
    // console.log("total pages: ", totalPages, totalCount);

    if (expenses.length < 1) {
      return res.status(200).json({
        success: false,
        message: "User doesn't have existing expenses",
        data: [],
        totalCount,
        totalPages,
      });
    }

    // Fetch additional details for each expense
    const detailedExpenses = await Promise.all(
      expenses.map(async (expense) => {
        const asset = await prisma.asset.findFirst({
          where: { id: expense.sourceId },
        });
        const category = await prisma.category.findFirst({
          where: { id: expense.categoryId },
        });

        return {
          ...expense,
          asset,
          category,
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


module.exports = {
  postExpense,
  getExpenses,
  postRecurringExpense
};
