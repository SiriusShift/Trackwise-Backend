const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const {
  postInstallment,
  getInstallment,
} = require("../services/installments.service");

const postInstallmentController = async (req, res, next) => {
  try {
    const installment = await postInstallment(req.user.id, req.body, req.file);
    res.status(200).json({
      message: "Installment created successfully",
      success: true,
      data: installment,
    });
  } catch (err) {
    console.error("Error while fetching expenses:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getInstallmentController = async (req, res, next) => {
  try {
    const installment = await getInstallment(req.user.id, req.query);
    res.status(200).json({
      message: "Installment fetched successfully",
      success: true,
      data: installment,
    });
  } catch (err) {
    console.error("Error while fetching expenses:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  postInstallmentController,
  getInstallmentController,
};
