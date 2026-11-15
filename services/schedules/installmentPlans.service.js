import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/AppError.js";
import {
  getBilledOwed,
  getStatementPayments,
  statementRemaining,
  syncCreditStatements,
  totalPaid,
} from "./creditStatements.service.js";
import { getTimezone, resolveTransferCategory } from "./shared.js";

// Data for a transfer that gives back what was paid on a plan's billed
// installments, from the card to the account that last paid it. Null when
// there is nothing to give back. The caller creates it inside its own
// transaction so the refund and the cancel commit together.
//
// Payments are treated as covering a statement's other charges first, so only
// the billed installments the user actually paid for come back:
//   refund = billed installments − what the card still owes on its bills
// Unpaid installments are simply dropped by the cancel, not refunded.
export const buildBilledInstallmentRefund = async (userId, planId) => {
  const plan = await prisma.creditInstallmentPlan.findUnique({
    where: { id: planId },
    select: { creditDetail: { select: { id: true, assetId: true } } },
  });
  const { id: creditDetailId, assetId: cardId } = plan.creditDetail;

  const billed = await prisma.creditInstallment.aggregate({
    where: { statementId: { not: null }, planId },
    _sum: { amount: true },
  });

  const billedAmount = Number(billed._sum.amount ?? 0);
  if (billedAmount <= 0) return null;

  // What the card owes on its bills right now. The newest statement's balance
  // already carries anything unpaid from older ones, so it alone is the total.
  // Purchases made after it closed aren't due yet and don't reduce the refund.
  const latestStatement = await prisma.creditStatement.findFirst({
    where: { creditDetailId },
    orderBy: { statementDate: "desc" },
  });

  const tz = await getTimezone(userId);
  let owed = 0;
  if (latestStatement) {
    const [payments, owedCap] = await Promise.all([
      getStatementPayments(latestStatement, cardId, tz),
      getBilledOwed(userId, cardId, creditDetailId, tz),
    ]);
    owed = statementRemaining(latestStatement, totalPaid(payments), owedCap);
  }

  const amount =
    Math.round(Math.min(Math.max(billedAmount - owed, 0), billedAmount) * 100) /
    100;
  if (amount <= 0) return null;

  // Counts payments made from the plain transfer form too, not just ones
  // linked to a statement.
  const lastPayment = await prisma.transfer.findFirst({
    where: {
      toAssetId: cardId,
      isActive: true,
      status: "Completed",
    },
    orderBy: { date: "desc" },
  });
  if (!lastPayment) return null;

  return {
    amount,
    date: new Date(),
    description: "Refund: cancelled installment purchase",
    status: "Completed",
    userId: Number(userId),
    categoryId: await resolveTransferCategory(userId),
    fromAssetId: cardId,
    toAssetId: lastPayment.fromAssetId, // the account that paid
  };
};

/*
|--------------------------------------------------------------------------
| Installment plans: cancel
|--------------------------------------------------------------------------
| Drops the installments not yet billed, marks the plan CANCELLED and archives
| its original purchase. Billed installments stay as history, and what was paid
| on them is given back with a refund transfer.
*/
export const cancelInstallmentPlan = async (userId, id) => {
  const planId = Number(id);

  const plan = await prisma.creditInstallmentPlan.findFirst({
    where: {
      id: planId,
      creditDetail: { asset: { userId: Number(userId) } },
    },
  });

  if (!plan) throw new AppError("Installment plan not found", 404);
  if (plan.status === "CANCELLED") {
    throw new AppError("This installment plan is already cancelled", 400);
  }

  const refund = await buildBilledInstallmentRefund(userId, planId);

  await prisma.$transaction([
    ...(refund ? [prisma.transfer.create({ data: refund })] : []),
    prisma.creditInstallment.deleteMany({
      where: { statementId: null, planId },
    }),
    prisma.creditInstallmentPlan.update({
      where: { id: planId },
      data: { status: "CANCELLED" },
    }),
    ...(plan.expenseId
      ? [
          prisma.expense.update({
            where: { id: plan.expenseId },
            data: { isActive: false },
          }),
        ]
      : []),
  ]);

  await syncCreditStatements(userId);
  return { id: planId, status: "CANCELLED" };
};
