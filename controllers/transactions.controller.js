const transactionService = require("../services/transactions.service");
const getHistory = async (req, res) => {
  try {
    const response = await transactionService.getHistory(req.user.id);
    res.status(200).json({
      message: "Transaction history successfully fetched",
      success: true,
      data: response,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
      success: false,
    });
  }
};

module.exports = {
  getHistory,
};
