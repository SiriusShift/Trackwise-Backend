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
  try {
    const response = incomeService.getIncomeGraph(req.user.id, req.query)
    return res.status(200).json({
      success: true,
      message: "Detailed incomes fetched successfully",
      data: response
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
    let income
    if (req.body) {
      income = await incomeService.getIncomeGraph(req.user.id, req.query)
    } else {
      income = await incomeService.updateIncome(
        req.user.id,
        req.body,
        req.file,
        id
      );
    }

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
