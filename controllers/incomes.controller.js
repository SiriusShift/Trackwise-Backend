const { PrismaClient } = require("@prisma/client");
// const { skip } = require("@prisma/client/runtime/library");
const prisma = new PrismaClient();
const incomeService = require("../services/incomes.service");
const postIncome = async (req, res) => {
  try {
    const response = incomeService.postIncome(req.user.id, req.body);
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


module.exports = {
    postIncome
}