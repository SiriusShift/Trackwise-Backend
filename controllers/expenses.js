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
        // if (asset) {
        //   const response = await prisma.asset.update({
        //     where: {
        //       id: req.body.source,
        //     },
        //     data: {
        //       balance: asset.balance - req.body.amount,
        //     },
        //   });
        //   console.log("updated asset: ", response);
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

  const page = parseInt(req.query.pageIndex) || 1;
  const pageSize = parseInt(req.query.pageSize) || 5;

  const skip = (page-1) * pageSize

  console.log("recurring", req.query.pageSize);

  try {
    const expenses = await prisma.expense.findMany({
      where: {
        userId: parseInt(userId),
        recurring: recurring,
      },
      orderBy: {
        date: "desc"
      },
      skip: skip,
      take: pageSize
    });

    const totalCount = expenses.length;
    const totalPages = Math.ceil(totalCount / pageSize);

    if (expenses.length < 1) {
      return res.status(200).json({
        success: false,
        message: "User doesn't have existing expenses",
        data: []
      });
    }

    // Fetch additional details for each expense
    const detailedExpenses = await Promise.all(
      expenses.map(async (expense) => {
        const asset = await prisma.asset.findFirst({
          where: { id: expense.sourceId }, // Use `expense.sourceId`
        });
        const category = await prisma.category.findFirst({
          where: { id: expense.categoryId }, // Use `expense.categoryId`
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
};
