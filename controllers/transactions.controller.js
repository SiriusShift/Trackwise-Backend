import * as transactionService from "../services/transactions.service.js";

/* ---------------- GET HISTORY ---------------- */
export const getHistory = async (req, res) => {
  try {
    const response = await transactionService.getHistory(
      req.user.id,
      req.query
    );

    return res.status(200).json({
      success: true,
      message: "Transaction history successfully fetched",
      data: response,
    });
  } catch (error) {
    console.error("getHistory error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/* ---------------- EDIT HISTORY ---------------- */
export const editHistory = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await transactionService.editHistory(
      req.user.id,
      req.body,
      req.file,
      id
    );

    return res.status(200).json({
      success: true,
      message: "Transaction history successfully edited",
      data: response,
    });
  } catch (error) {
    console.error("editHistory error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/* ---------------- DELETE HISTORY ---------------- */
export const deleteHistory = async (req, res) => {
  const { id } = req.params;

  try {
    await transactionService.deleteHistory(id);

    return res.status(200).json({
      success: true,
      message: "Transaction history successfully deleted",
    });
  } catch (error) {
    console.error("deleteHistory error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/* ---------------- STATISTICS ---------------- */
export const getStatistics = async (req, res) => {
  try {
    const response = await transactionService.getStatistics(
      req.user.id,
      req.query
    );

    return res.status(200).json({
      success: true,
      message: "Statistics fetched successfully",
      ...response,
    });
  } catch (error) {
    console.error("getStatistics error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
    });
  }
};

/* ---------------- ARCHIVE ---------------- */
export const archiveTransaction = async (req, res) => {
  const { id } = req.params;

  try {
    await transactionService.archiveTransaction(
      req.query.type,
      id
    );

    return res.status(200).json({
      success: true,
      message: "Transaction archived successfully",
    });
  } catch (error) {
    console.error("archiveTransaction error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/* ---------------- DUE ---------------- */

// export const dueTransactions = async (req, res) => {
//   const { id } = req.params;

//   try {
//     const response = await transactionService.getDueTransactions(
//       req.user.id
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Due transactions successfully fetched",
//       ...response
//     });
//   } catch (error) {
//     console.error("archiveTransaction error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// };