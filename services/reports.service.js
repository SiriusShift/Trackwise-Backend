import moment from "moment-timezone";
import Papa from "papaparse";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  billedInstallmentCount,
  lastStatementClose,
} from "../utils/creditCycle.js";
import { getAssetBalance } from "./assets.service.js";
import { generateExcelBuffer } from "./excel.service.js";
import { syncCreditStatements } from "./schedules.service.js";
import { LIQUID_CATEGORIES } from "./transactions.service.js";

const round2 = (n) => Math.round(n * 100) / 100;

export const getTransactionStatement = async ({
  userId,
  assetId,
  from: fromDate,
  to: toDate,
  format,
  timezone = "UTC",
}) => {
  // Whole days in the user's timezone, not the server's
  const from = moment.tz(fromDate, timezone).startOf("day").toDate();
  const to = moment.tz(toDate, timezone).endOf("day").toDate();
  // Opening balance = everything before the first moment of the statement
  const openingResult = await getAssetBalance(userId, assetId, {
    asOf: new Date(from.getTime() - 1),
  });
  const openingBalance = openingResult?.data?.[0]?.remainingBalance ?? 0;
  const filters = {
    isActive: true,
    userId: Number(userId),
    status: "Completed",
  };

  const [expenses, incomes, transfers] = await Promise.all([
    prisma.expense.findMany({
      where: {
        ...filters,
        assetId: Number(assetId),
        date: { gte: from, lte: to },
      },
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        status: true,
        category: { select: { name: true } },
      },
    }),
    prisma.income.findMany({
      where: {
        ...filters,
        assetId: Number(assetId),
        date: { gte: from, lte: to },
      },
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        status: true,
        category: { select: { name: true } },
      },
    }),
    prisma.transfer.findMany({
      where: {
        ...filters,
        OR: [{ fromAssetId: Number(assetId) }, { toAssetId: Number(assetId) }],
        date: { gte: from, lte: to },
      },
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        status: true,
        category: { select: { name: true } },
        fromAssetId: true,
        toAssetId: true,
      },
    }),
  ]);

  const formattedExpenses = expenses.map((item) => ({
    id: `expense-${item.id}`,
    type: "Expense",
    credit: 0,
    debit: Number(item.amount),
    description: item.description,
    date: item.date,
    category: item.category,
  }));

  const formattedIncomes = incomes.map((item) => ({
    id: `income-${item.id}`,
    type: "Income",
    credit: Number(item.amount),
    debit: 0,
    description: item.description,
    date: item.date,
    category: item.category,
  }));

  const formattedTransfers = transfers.map((item) => {
    const isOutgoing = item.fromAssetId === Number(assetId);
    return {
      id: `transfer-${item.id}`,
      type: "Transfer",
      credit: isOutgoing ? 0 : Number(item.amount),
      debit: isOutgoing ? Number(item.amount) : 0,
      description: item.description,
      date: item.date,
      category: item.category,
    };
  });

  const mergedTransactions = [
    ...formattedExpenses,
    ...formattedIncomes,
    ...formattedTransfers,
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  let runningBalance = openingBalance;
  let totalCredit = 0;
  let totalDebit = 0;

  const withBalance = mergedTransactions.map((tx) => {
    totalCredit += tx.credit;
    totalDebit += tx.debit;
    runningBalance =
      Math.round((runningBalance + tx.credit - tx.debit) * 100) / 100;
    return { ...tx, balance: runningBalance };
  });

  if (format === "excel" || format === "csv") {
    const columns = [
      { header: "Date", key: "date", width: 20 },
      { header: "Type", key: "type", width: 12 },
      { header: "Category", key: "category", width: 20 },
      { header: "Description", key: "description", width: 30 },
      { header: "Credit", key: "credit", width: 14, numFmt: "#,##0.00" },
      { header: "Debit", key: "debit", width: 14, numFmt: "#,##0.00" },
      { header: "Balance", key: "balance", width: 14, numFmt: "#,##0.00" },
    ];

    const rows = withBalance.map((tx) => ({
      date: moment.tz(tx.date, timezone).format("YYYY-MM-DD hh:mm A"),
      type: tx.type,
      category: tx.category?.name ?? "",
      description: tx.description,
      credit: tx.credit || null,
      debit: tx.debit || null,
      balance: tx.balance,
    }));

    const summary = [
      { label: "Opening Balance", value: openingBalance },
      { label: "Closing Balance", value: runningBalance },
      { label: "Total Credit", value: totalCredit },
      { label: "Total Debit", value: totalDebit },
    ];

    if (format === "excel") {
      return generateExcelBuffer({
        sheetName: "Statement",
        columns,
        rows,
        summary,
      });
    }

    return Papa.unparse(rows);
  }

  return {
    openingBalance,
    closingBalance: runningBalance,
    totalCredit,
    totalDebit,
    transactions: withBalance,
  };
};

export const getMoneyFlowStatement = async ({
  userId,
  from: fromDate,
  to: toDate,
  format,
  timezone = "UTC",
}) => {
  // Whole days in the user's timezone, not the server's
  const from = moment.tz(fromDate, timezone).startOf("day").toDate();
  const to = moment.tz(toDate, timezone).endOf("day").toDate();

  // Opening = combined CASH/BANK balance just before the statement starts
  const openingResult = await getAssetBalance(userId, null, {
    asOf: new Date(from.getTime() - 1),
  });
  const moneyAssets = (openingResult?.data ?? []).filter((a) =>
    LIQUID_CATEGORIES.includes(a.category),
  );
  const moneyIds = moneyAssets.map((a) => a.id);
  const isMoney = (id) => moneyIds.includes(id);
  const openingBalance =
    Math.round(
      moneyAssets.reduce((sum, a) => sum + a.convertedBalance, 0) * 100,
    ) / 100;

  const filters = {
    isActive: true,
    userId: Number(userId),
    status: "Completed",
    date: { gte: from, lte: to },
  };
  const txSelect = {
    id: true,
    date: true,
    amount: true,
    description: true,
    category: { select: { name: true } },
  };

  const [expenses, incomes, transfers] = await Promise.all([
    prisma.expense.findMany({
      where: { ...filters, assetId: { in: moneyIds } },
      select: { ...txSelect, asset: { select: { name: true } } },
    }),
    prisma.income.findMany({
      where: { ...filters, assetId: { in: moneyIds } },
      select: { ...txSelect, asset: { select: { name: true } } },
    }),
    prisma.transfer.findMany({
      where: {
        ...filters,
        OR: [
          { fromAssetId: { in: moneyIds } },
          { toAssetId: { in: moneyIds } },
        ],
      },
      select: {
        ...txSelect,
        fromAssetId: true,
        toAssetId: true,
        fromAsset: { select: { name: true } },
        toAsset: { select: { name: true } },
      },
    }),
  ]);

  // `change` is the effect on total money: + in, - out, 0 for moves between own accounts
  const formattedExpenses = expenses.map((item) => ({
    id: `expense-${item.id}`,
    type: "Expense",
    date: item.date,
    description: item.description,
    from: item.asset?.name ?? "",
    to: null,
    amount: Number(item.amount),
    change: -Number(item.amount),
  }));

  const formattedIncomes = incomes.map((item) => ({
    id: `income-${item.id}`,
    type: "Income",
    date: item.date,
    description: item.description,
    from: null,
    to: item.asset?.name ?? "",
    amount: Number(item.amount),
    change: Number(item.amount),
  }));

  const formattedTransfers = transfers.map((item) => {
    const amount = Number(item.amount);
    const change =
      (isMoney(item.toAssetId) ? amount : 0) -
      (isMoney(item.fromAssetId) ? amount : 0);
    return {
      id: `transfer-${item.id}`,
      type: "Transfer",
      date: item.date,
      description: item.description,
      from: item.fromAsset?.name ?? "",
      to: item.toAsset?.name ?? item.category?.name ?? "",
      amount,
      change,
    };
  });

  const mergedTransactions = [
    ...formattedExpenses,
    ...formattedIncomes,
    ...formattedTransfers,
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  let runningBalance = openingBalance;
  let totalIn = 0;
  let totalOut = 0;

  const withBalance = mergedTransactions.map((tx) => {
    if (tx.change > 0) totalIn += tx.change;
    if (tx.change < 0) totalOut -= tx.change;
    runningBalance = Math.round((runningBalance + tx.change) * 100) / 100;
    return { ...tx, balance: runningBalance };
  });

  if (format === "excel" || format === "csv") {
    const columns = [
      { header: "Date", key: "date", width: 20 },
      { header: "Type", key: "type", width: 12 },
      { header: "Description", key: "description", width: 30 },
      { header: "From", key: "from", width: 20 },
      { header: "To", key: "to", width: 20 },
      { header: "Amount", key: "amount", width: 14, numFmt: "#,##0.00" },
      { header: "Total Money", key: "balance", width: 14, numFmt: "#,##0.00" },
    ];

    const rows = withBalance.map((tx) => ({
      date: moment.tz(tx.date, timezone).format("YYYY-MM-DD hh:mm A"),
      type: tx.type,
      description: tx.description,
      from: tx.from,
      to: tx.to,
      amount: tx.amount,
      balance: tx.balance,
    }));

    const summary = [
      { label: "Opening Balance", value: openingBalance },
      { label: "Total Money In", value: totalIn },
      { label: "Total Money Out", value: totalOut },
      { label: "Closing Balance", value: runningBalance },
    ];

    if (format === "excel") {
      return generateExcelBuffer({
        sheetName: "Money Flow",
        columns,
        rows,
        summary,
      });
    }

    return Papa.unparse(rows);
  }

  return {
    openingBalance,
    closingBalance: runningBalance,
    totalIn,
    totalOut,
    transactions: withBalance,
  };
};

/*
|--------------------------------------------------------------------------
| Credit card statement
|--------------------------------------------------------------------------
| A bank-style statement for one closed billing cycle. The card's balance
| holds an installment purchase in full, but only billed installments belong
| on a statement, so the cycle is rebuilt the same way
| CreditStatement.statementBalance is: balance at close less installment
| principal not yet billed.
*/

// Closed statements of a card, newest first, for picking one to export.
export const getCreditStatementList = async ({ userId, assetId, timezone }) => {
  await syncCreditStatements(userId, timezone);

  const card = await prisma.asset.findFirst({
    where: { id: Number(assetId), userId: Number(userId), category: "CREDIT" },
    select: { creditDetail: { select: { id: true } } },
  });
  if (!card?.creditDetail) throw new AppError("Credit card not found", 404);

  const statements = await prisma.creditStatement.findMany({
    where: { creditDetailId: card.creditDetail.id },
    select: {
      id: true,
      statementDate: true,
      dueDate: true,
      statementBalance: true,
      status: true,
    },
    orderBy: { statementDate: "desc" },
  });

  return statements.map((s) => ({
    ...s,
    statementBalance: Number(s.statementBalance),
  }));
};

const planPurchaseDate = (plan) => plan.expense?.date ?? plan.startDate;

// Installment principal of a plan still to be billed after the statement
// closing on `close`. Zero when the purchase came after that close.
const unbilledPrincipal = (plan, close, timezone) => {
  if (moment(planPurchaseDate(plan)).isAfter(close.clone().endOf("day")))
    return 0;
  const billed = billedInstallmentCount(
    plan.startDate,
    close,
    plan.termMonths,
    timezone,
  );
  return round2(
    (Number(plan.totalAmount) * (plan.termMonths - billed)) / plan.termMonths,
  );
};

export const getCreditCardStatement = async ({
  userId,
  statementId,
  format,
  timezone = "UTC",
}) => {
  const statement = await prisma.creditStatement.findFirst({
    where: {
      id: Number(statementId),
      creditDetail: { asset: { userId: Number(userId) } },
    },
    include: {
      creditDetail: {
        include: {
          asset: {
            select: { id: true, name: true, institution: true, currency: true },
          },
          installmentPlans: {
            where: { status: { not: "CANCELLED" } },
            include: { expense: { select: { id: true, date: true } } },
          },
        },
      },
    },
  });
  if (!statement) throw new AppError("Credit statement not found", 404);

  const { creditDetail } = statement;
  const card = creditDetail.asset;
  const plans = creditDetail.installmentPlans;

  // The cycle runs from the day after the previous close through this close.
  const close = moment.tz(statement.statementDate, timezone).startOf("day");
  const prevClose = lastStatementClose(
    close.clone().subtract(1, "day"),
    creditDetail.statementDate,
  );
  const periodStart = prevClose.clone().add(1, "day").startOf("day");
  const periodEnd = close.clone().endOf("day");

  const base = {
    isActive: true,
    userId: Number(userId),
    status: "Completed",
    date: { gte: periodStart.toDate(), lte: periodEnd.toDate() },
  };
  const select = {
    id: true,
    date: true,
    amount: true,
    description: true,
    category: { select: { name: true } },
  };

  const [
    expenses,
    incomes,
    transfersOut,
    transfersIn,
    payments,
    openingResult,
    closingResult,
  ] = await Promise.all([
    prisma.expense.findMany({ where: { ...base, assetId: card.id }, select }),
    prisma.income.findMany({ where: { ...base, assetId: card.id }, select }),
    prisma.transfer.findMany({
      where: { ...base, fromAssetId: card.id },
      select: { ...select, toAsset: { select: { name: true } } },
    }),
    prisma.transfer.findMany({
      where: { ...base, toAssetId: card.id },
      select: { ...select, fromAsset: { select: { name: true } } },
    }),
    // Payments toward this bill, made after it closed.
    prisma.transfer.findMany({
      where: {
        toAssetId: card.id,
        isActive: true,
        status: "Completed",
        date: { gt: periodEnd.toDate() },
        creditStatementId: statement.id,
      },
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        fromAsset: { select: { name: true } },
      },
      orderBy: { date: "asc" },
    }),
    getAssetBalance(userId, card.id, {
      asOf: prevClose.clone().endOf("day").toDate(),
    }),
    getAssetBalance(userId, card.id, { asOf: periodEnd.toDate() }),
  ]);

  // Installment purchases reach the bill through their installments instead.
  const planExpenseIds = new Set(
    plans.map((p) => p.expense?.id).filter(Boolean),
  );

  // `amount` is how the entry moves what's owed: + charges, - payments/credits.
  const entry = (type, row, sign, counterpart) => ({
    id: `${type.toLowerCase().replace(" ", "-")}-${row.id}`,
    type,
    date: row.date,
    description: row.description,
    category: row.category?.name ?? null,
    counterpart: counterpart ?? null,
    amount: sign * Number(row.amount),
  });

  const transactions = [
    ...expenses
      .filter((r) => !planExpenseIds.has(r.id))
      .map((r) => entry("Purchase", r, 1)),
    ...transfersOut.map((r) => entry("Cash advance", r, 1, r.toAsset?.name)),
    ...incomes.map((r) => entry("Credit", r, -1)),
    ...transfersIn.map((r) => entry("Payment", r, -1, r.fromAsset?.name)),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Principal each plan moved onto the bill this cycle. A plan bought this
  // cycle wasn't on the card at the previous close, so all of it starts unbilled.
  const installments = plans
    .filter((plan) => !moment(planPurchaseDate(plan)).isAfter(periodEnd))
    .map((plan) => {
      const before = moment(planPurchaseDate(plan)).isAfter(
        prevClose.clone().endOf("day"),
      )
        ? Number(plan.totalAmount)
        : unbilledPrincipal(plan, prevClose, timezone);
      return {
        planId: plan.id,
        description: plan.description,
        installmentNo: billedInstallmentCount(
          plan.startDate,
          close,
          plan.termMonths,
          timezone,
        ),
        termMonths: plan.termMonths,
        totalAmount: Number(plan.totalAmount),
        amount: round2(before - unbilledPrincipal(plan, close, timezone)),
      };
    })
    .filter((line) => line.amount !== 0);

  const unbilledAt = (date) =>
    plans.reduce((sum, p) => sum + unbilledPrincipal(p, date, timezone), 0);
  const openingOwed = Number(openingResult?.data?.[0]?.remainingBalance ?? 0);
  const closingOwed = Number(closingResult?.data?.[0]?.remainingBalance ?? 0);

  const previousBalance = round2(openingOwed - unbilledAt(prevClose));
  const purchases = round2(
    transactions
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0),
  );
  const paymentsAndCredits = round2(
    transactions
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum - t.amount, 0),
  );
  const installmentsBilled = round2(
    installments.reduce((sum, i) => sum + i.amount, 0),
  );
  const statementBalance = Number(statement.statementBalance);
  // The bill was fixed when the cycle closed and never goes below zero, so a
  // credit balance or anything edited since shows up here.
  const adjustments = round2(
    statementBalance -
      (previousBalance - paymentsAndCredits + purchases + installmentsBilled),
  );

  const interestCharged = Number(statement.interestCharged);
  const lateFeeCharged = Number(statement.lateFeeCharged);
  const otherFees = Number(statement.otherFees);
  const totalAmountDue = round2(
    statementBalance + interestCharged + lateFeeCharged + otherFees,
  );
  const amountPaid = round2(
    payments.reduce((sum, p) => sum + Number(p.amount), 0),
  );
  const creditLimit = Number(creditDetail.creditLimit);

  const summary = {
    previousBalance,
    paymentsAndCredits,
    purchases,
    installmentsBilled,
    adjustments,
    statementBalance,
    interestCharged,
    lateFeeCharged,
    otherFees,
    totalAmountDue,
    amountPaid,
    remainingDue: round2(Math.max(totalAmountDue - amountPaid, 0)),
    creditLimit,
    availableCredit: round2(creditLimit - closingOwed),
  };

  if (format === "excel" || format === "csv") {
    const columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Type", key: "type", width: 14 },
      { header: "Description", key: "description", width: 32 },
      { header: "Category", key: "category", width: 20 },
      { header: "Charges", key: "charges", width: 14, numFmt: "#,##0.00" },
      {
        header: "Payments & Credits",
        key: "credits",
        width: 18,
        numFmt: "#,##0.00",
      },
    ];

    const rows = [
      ...transactions.map((tx) => ({
        date: moment.tz(tx.date, timezone).format("YYYY-MM-DD"),
        type: tx.type,
        description: tx.description,
        category: tx.category ?? tx.counterpart ?? "",
        charges: tx.amount > 0 ? tx.amount : null,
        credits: tx.amount < 0 ? -tx.amount : null,
      })),
      ...installments.map((i) => ({
        date: close.format("YYYY-MM-DD"),
        type: "Installment",
        description: `${i.description} (${i.installmentNo}/${i.termMonths})`,
        category: "",
        charges: i.amount > 0 ? i.amount : null,
        credits: i.amount < 0 ? -i.amount : null,
      })),
    ];

    const summaryRows = [
      { label: "Card", value: card.name },
      { label: "Statement Date", value: close.format("YYYY-MM-DD") },
      {
        label: "Payment Due Date",
        value: moment.tz(statement.dueDate, timezone).format("YYYY-MM-DD"),
      },
      {
        label: "Statement Period",
        value: `${periodStart.format("YYYY-MM-DD")} to ${close.format("YYYY-MM-DD")}`,
      },
      { label: "Previous Balance", value: previousBalance },
      { label: "Payments & Credits", value: -paymentsAndCredits },
      { label: "Purchases & Charges", value: purchases },
      { label: "Installments Billed", value: installmentsBilled },
      ...(adjustments ? [{ label: "Adjustments", value: adjustments }] : []),
      { label: "Statement Balance", value: statementBalance },
      {
        label: "Interest & Fees",
        value: round2(interestCharged + lateFeeCharged + otherFees),
      },
      { label: "Total Amount Due", value: totalAmountDue },
      { label: "Paid Since Statement", value: amountPaid },
      { label: "Credit Limit", value: creditLimit },
      { label: "Available Credit", value: summary.availableCredit },
    ];

    if (format === "excel") {
      return generateExcelBuffer({
        sheetName: "Credit Statement",
        columns,
        rows,
        summary: summaryRows,
      });
    }

    return Papa.unparse(rows);
  }

  return {
    card: {
      id: card.id,
      name: card.name,
      institution: card.institution,
      currency: card.currency,
    },
    statementId: statement.id,
    status: statement.status,
    periodStart: periodStart.toDate(),
    statementDate: statement.statementDate,
    dueDate: statement.dueDate,
    summary,
    transactions,
    installments,
    payments: payments.map((p) => ({
      id: p.id,
      date: p.date,
      description: p.description,
      from: p.fromAsset?.name ?? null,
      amount: Number(p.amount),
    })),
  };
};
