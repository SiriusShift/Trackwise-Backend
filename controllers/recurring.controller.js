import * as recurringService from "../services/recurring.service.js";
/*
|--------------------------------------------------------------------------
| Create Recurring
|--------------------------------------------------------------------------
*/
export const postRecurring = async (req, res) => {
  try {
    const response = await recurringService.postRecurring(
      req.user.id,
      req.body
    );

    return res.status(200).json({
      message: `Recurring ${req.body.type} successfully created`,
      success: true,
      data: response,
    });
  } catch (err) {
    console.error("postRecurring error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/*
|--------------------------------------------------------------------------
| Get Recurring
|--------------------------------------------------------------------------
*/
export const getRecurring = async (req, res) => {
  try {
    const response = await recurringService.getRecurring(
      req.user.id,
      req.query
    );

    return res.status(200).json({
      message: `Successfully fetched recurring ${req.query.type}`,
      success: true,
      ...response,
    });
  } catch (err) {
    console.error("getRecurring error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/*
|--------------------------------------------------------------------------
| Edit Recurring
|--------------------------------------------------------------------------
*/
export const editRecurring = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await recurringService.editRecurring(id, req.query);

    return res.status(200).json({
      message: `Successfully editing recurring ${req.query.type}`,
      success: true,
      ...response,
    });
  } catch (err) {
    console.error("editRecurring error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/*
|--------------------------------------------------------------------------
| Cancel Recurring
|--------------------------------------------------------------------------
*/
export const cancelRecurring = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await recurringService.cancelRecurring(id);

    return res.status(200).json({
      message: `Successfully cancelled recurring ${req.query.type}`,
      success: true,
      ...response,
    });
  } catch (err) {
    console.error("cancelRecurring error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/*
|--------------------------------------------------------------------------
| Transact Recurring
|--------------------------------------------------------------------------
*/
export const transactRecurring = async (req, res) => {
  const { id } = req.params;
  const { type } = req.body;

  try {
    const response = await recurringService.transactRecurring(
      req.user.id,
      id,
      type
    );

    if (!response.success) {
      return res.status(400).json({
        success: false,
        message: response.message,
      });
    }

    return res.status(200).json({
      message: `Successfully transacted recurring ${type}`,
      success: true,
      ...response,
    });
  } catch (err) {
    console.error("transactRecurring error:", err);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

/*
|--------------------------------------------------------------------------
| (Optional) Archive Recurring - commented out
|--------------------------------------------------------------------------
*/
// export const archiveRecurring = async (req, res) => {
//   const { id } = req.params;
//
//   try {
//     const response = await recurringService.archiveRecurring(id, req.query);
//
//     return res.status(200).json({
//       message: `Successfully archived recurring ${req.query.type}`,
//       success: true,
//       ...response,
//     });
//   } catch (err) {
//     console.error("archiveRecurring error:", err);
//     return res.status(500).json({
//       error: "Internal server error",
//     });
//   }
// };