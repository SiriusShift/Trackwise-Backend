const recurringService = require("../services/recurring.service");

const postRecurring = async (req, res, next) => {
  try {
    const response = recurringService.postRecurring(req.user.id, req.body);
    res.status(200).json({
      message: `Recurring ${req.body.type} successfully created`,
      success: true,
      data: response,
    });
  } catch (err) {
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

const getRecurring = async (req, res, next) => {
  if (!req.user?.id) {
    return res.status(400).json({
      success: false,
      message: "User ID is required",
    });
  }
  try {
    const response = await recurringService.getRecurring(req.user.id, req.query);
    console.log(response, "response")
    res.status(200).json({
      message: `Successfully fetched recurring ${req.query.type}`,
      success: true,
      ...response,
    });
  } catch (err) {
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

module.exports = {
  postRecurring,
  getRecurring,
};
