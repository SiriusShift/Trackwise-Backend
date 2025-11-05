const transactionService = require("../services/transactions.service");
const getHistory = async (req, res) => {
  try {
    const response = await transactionService.getHistory(
      req.user.id,
      req.query
    );
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

const editHistory = async (req, res) => {
  const { id } = req.params;
  try {
    const response = await transactionService.editHistory(
      req.user.id,
      req.body,
      req.file,
      id
    );
    res.status(200).json({
      message: "Transaction history successfully edited",
      success: true,
      data: response,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};

const deleteHistory = async (req, res) => {
  const { id } = req.params;
  try {
    const response = await transactionService.deleteHistory(id);
    res.status(200).json({
      message: "Transaction history successfully deleted",
      success: true,
      data: response,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};

module.exports = {
  getHistory,
  editHistory,
  deleteHistory
};
