const { PrismaClient } = require("@prisma/client");
// const { skip } = require("@prisma/client/runtime/library");
const prisma = new PrismaClient();
const incomeService = require("../services/incomes.service");
const postIncome = async (req, res) => {
  try {
    const response = incomeService.postIncome(req.user.id, req.body, req.file);
    console.log("response", response);
    res.status(200).json({
      success: true,
      message: "Income successfully created",
      response,
    });
  } catch (err) {
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

const getIncome = async (req, res) => {
  try {
    const response = await incomeService.getIncome(req.user.id, req.query);
    console.log(response);
    res.status(200).json({
      success: true,
      message: "Income fetched successfully",
      ...response,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

const getGraph = async (req, res, next) => {
  const { startDate, endDate, mode } = req.query;

  try {
    const filters = {
      userId: parseInt(req.user.id),
      date: {
        gte: startDate,
        lte: endDate,
      },
      isActive: true,
    };
    console.log("filters", filters);
    const groupedIncomes = await prisma.$queryRawUnsafe(
      `SELECT 
        date_trunc('${mode}', "date") AS "${mode}",
        sum(amount) AS total
      FROM "Income"
      WHERE "date" >= '${startDate}'::timestamp AND "date" <= '${endDate}'::timestamp AND "isActive" = true
      GROUP BY "${mode}", "amount"
      ORDER BY "${mode}"`
    );
    console.log("group income!", groupedIncomes);

    const trend = (
      ((groupedIncomes[1]?._sum?.amount - groupedIncomes[0]?._sum?.amount) /
        groupedIncomes[0]?._sum?.amount) *
      100
    ).toFixed(2);

    const categoryIncomes = await prisma.income.groupBy({
      by: ["categoryId"],
      where: filters,
      _sum: { amount: true },
    });

    const detailedCategoryIncomes = await Promise.all(
      categoryIncomes.map(async (item) => {
        const category = await prisma.categories.findFirst({
          where: { id: item.categoryId },
        });
        return {
          categoryId: item.categoryId,
          categoryName: category?.name || "Unknown",
          total: item._sum.amount || 0,
        };
      })
    );

    const totalExpense = await prisma.income.aggregate({
      where: filters,
      _sum: { amount: true },
    });

    return res.status(200).json({
      success: true,
      message: "Detailed incomes fetched successfully",
      data: {
        trend,
        data: detailedCategoryIncomes,
        total: totalExpense._sum.amount || 0,
      },
    });
  } catch (err) {
    console.error("Error while fetching detailed incomes:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

const updateIncome = async (req, res, next) => {
  const { id } = req.params;
  try {
    const income = await incomeService.updateIncome(
      req.user.id,
      req.body,
      req.file,
      id
    );
    res.status(200).json({
      success: true,
      message: "Income updated successfully",
      data: income,
    });
  } catch (err) {
    console.log("Error while updating expense", err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

module.exports = {
  postIncome,
  updateIncome,
  getIncome,
  getGraph,
};
