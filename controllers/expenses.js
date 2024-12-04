const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const postExpense = async (req, res, next) => {
  console.log("hello", req.body);
  try {
    await prisma.asset
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
    
    await prisma.asset
      .findFirst({
        where: {
          id: req.body.source,
        },
      })
      .then((asset) => {
        if (asset) {
          prisma.asset.update({
            where: {
              id: req.body.source,
            },
            data: {
              balance: asset.balance - req.body.amount,
            },
          });
        } else {
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
        date: req.body.date, // Date is required
        recurring: req.body.recurring, // Recurring is required
        status: req.body.status || null, // Status is optional, defaulting to null if not provided
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

module.exports = {
  postExpense,
};
