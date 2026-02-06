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
  try {
    const response = await recurringService.getRecurring(
      req.user.id,
      req.query
    );
    console.log(response, "response");
    res.status(200).json({
      message: `Successfully fetched recurring ${req.query.type}`,
      success: true,
      ...response,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

const editRecurring = async (req, res, next) => {
  const { id } = req.params;
  try {
    const response = await recurringService.editRecurring(id, req.query);
    res.status(200).json({
      message: `Successfully editing recurring ${req.query.type}`,
      success: true,
      ...response,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

const cancelRecurring = async (req, res, next) => {
  const { id } = req.params;
  try {
    const response = await recurringService.cancelRecurring(id);
    res.status(200).json({
      message: `Successfully cancelled recurring ${req.query.type}`,
      success: true,
      ...response,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

// const archiveRecurring = async (req, res, next) => {
//   const { id } = req.params;
//   try {
//     const response = await recurringService.archiveRecurring(id, req.query);
//     res.status(200).json({
//       message: `Successfully archived recurring ${req.query.type}`,
//       success: true,
//       ...response,
//     });
//   } catch (err) {
//     console.log(err);
//     res.status(500).json({
//       error: "Internal server error",
//     });
//   }
// };

const transactRecurring = async (req, res) => {
  const type = req.body.type;
  const { id } = req.params;
  try {
    const response = await recurringService.transactRecurring(
      req.user.id,
      id,
      type
    );
    if (!response.success) {
      return res
        .status(400)
        .json({ success: false, message: response.message });
    }
    res.status(200).json({
      message: `Successfully transacted recurring ${type}`,
      success: true,
      ...response,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};

module.exports = {
  postRecurring,
  getRecurring,
  editRecurring,
  cancelRecurring,
  // archiveRecurring,
  transactRecurring,
};
