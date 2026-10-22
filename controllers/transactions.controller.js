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
      id,
          req.user.id
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

/* ---------------- RESTORE ---------------- */
// Errors bubble to the error handler (via catchAsync) so the client gets the
// real status and message, e.g. why an installment purchase can't be restored.
export const restoreTransaction = async (req, res) => {
  await transactionService.restoreTransaction(
    req.query.type,
    req.params.id,
    req.user.id,
  );

  return res.status(200).json({
    success: true,
    message: "Transaction restored successfully",
  });
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