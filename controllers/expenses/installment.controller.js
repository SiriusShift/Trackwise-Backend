const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const {
  postInstallment,
  getInstallment
} = require("../../services/expense/installment.service");

const postInstallment = async (res, req, next) => {
  try {
    const installment = await postInstallment(req.user.id, req.body, req.file);
    res.status(200).json({
      message: "Installment created successfully",
      success: true,
      data: installment,
    });
  } catch (err) {
    console.error("Error while fetching expenses:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getInstallment = async (res, req, next) => {
  try {
    const installment = await getInstallment(req.user.id, req.body, req.file);
    res.status(200).json({
      message: "Installment fetched successfully",
      success: true,
      data: installment,
    });
  } catch (err) {
    console.error("Error while fetching expenses:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
