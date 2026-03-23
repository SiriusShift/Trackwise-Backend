const { validateAsset, getAssetBalance } = require("../services/assets.service");

const determineTransactionStatus = async (type, auto, fromAssetId, amount, userId) => {
  console.log("test!")
  if (!auto) {
    return "Pending";
  }

  // Income always succeeds (adds money)
  if (type === "Income") {
    return "Received";
  }

  // Check balance for Expense and Transfer
  const asset = await getAssetBalance(userId,fromAssetId);

  console.log(asset.balance, amount);
  if (asset.balance < amount) {
    return "Failed";
  }
  if (type === "Expense") {
    return "Paid";
  }
  return "Completed";
};

module.exports = {determineTransactionStatus} 