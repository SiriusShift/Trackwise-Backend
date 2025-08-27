const { PrismaClient } = require("@prisma/client");
const prisma = PrismaClient();
const recurringService = require("../services/recurring.service")

const postRecurring = async (req, res) => {
  try {
    const response = await recurringService.postRecurring(req.user.id, req.body)
    res.status(200).json({
        message: `Recurring ${req.body.type} successfully created`,
        success: true,
        data: response
    })
  } catch (err) {
    res.status(500).json({
      error: "Internal server error",
    });
  }
};


module.exports = {
    postRecurring
}