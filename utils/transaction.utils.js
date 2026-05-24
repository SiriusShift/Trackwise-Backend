import { getAssetBalance } from "../services/assets.service.js";

export const determineTransactionStatus = async (
  type,
  behaviour,
  fromAssetId,
  amount,
  userId
) => {
  // 1. Not executed yet
  if (behaviour === "REMIND") {
    return "Pending";
  }

  // 2. Income (no balance validation needed)
  if (type === "Income") {
    return "Completed";
  }

  // 3. Expense + Transfer require balance check
  const asset = await getAssetBalance(userId, fromAssetId);

  if (!asset || asset.balance < amount) {
    return "Failed";
  }

  return "Completed";
};