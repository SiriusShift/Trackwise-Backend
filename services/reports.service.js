import moment from "moment-timezone";
import Papa from "papaparse";
import { prisma } from "../config/prisma.js";
import { getAssetBalance } from "./assets.service.js";
import { generateExcelBuffer } from "./excel.service.js";
import { LIQUID_CATEGORIES } from "./transactions.service.js";
export const getTransactionStatement = async ({ userId, assetId, from: fromDate, to: toDate, format, timezone = "UTC" }) => {
    // Whole days in the user's timezone, not the server's
    const from = moment.tz(fromDate, timezone).startOf("day").toDate();
    const to = moment.tz(toDate, timezone).endOf("day").toDate();
    // Opening balance = everything before the first moment of the statement
    const openingResult = await getAssetBalance(userId, assetId, { asOf: new Date(from.getTime() - 1) });
    const openingBalance = openingResult?.data?.[0]?.remainingBalance ?? 0;
    const filters = {
        isActive: true,
        userId: Number(userId),
        status: "Completed",
    };

    const [expenses, incomes, transfers] = await Promise.all([
        prisma.expense.findMany({
            where: { ...filters, assetId: Number(assetId), date: { gte: from, lte: to } }, select: {
                id: true, date: true, amount: true, description: true, status: true,
                category: { select: { name: true } },
            },
        }),
        prisma.income.findMany({
            where: { ...filters, assetId: Number(assetId), date: { gte: from, lte: to } }, select: {
                id: true, date: true, amount: true, description: true, status: true,
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
                id: true, date: true, amount: true, description: true, status: true,
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
        runningBalance = Math.round((runningBalance + tx.credit - tx.debit) * 100) / 100;
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
            return generateExcelBuffer({ sheetName: "Statement", columns, rows, summary });
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

export const getMoneyFlowStatement = async ({ userId, from: fromDate, to: toDate, format, timezone = "UTC" }) => {
    // Whole days in the user's timezone, not the server's
    const from = moment.tz(fromDate, timezone).startOf("day").toDate();
    const to = moment.tz(toDate, timezone).endOf("day").toDate();

    // Opening = combined CASH/BANK balance just before the statement starts
    const openingResult = await getAssetBalance(userId, null, { asOf: new Date(from.getTime() - 1) });
    const moneyAssets = (openingResult?.data ?? []).filter((a) => LIQUID_CATEGORIES.includes(a.category));
    const moneyIds = moneyAssets.map((a) => a.id);
    const isMoney = (id) => moneyIds.includes(id);
    const openingBalance = Math.round(moneyAssets.reduce((sum, a) => sum + a.convertedBalance, 0) * 100) / 100;

    const filters = {
        isActive: true,
        userId: Number(userId),
        status: "Completed",
        date: { gte: from, lte: to },
    };
    const txSelect = {
        id: true, date: true, amount: true, description: true,
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
                OR: [{ fromAssetId: { in: moneyIds } }, { toAssetId: { in: moneyIds } }],
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
        const change = (isMoney(item.toAssetId) ? amount : 0) - (isMoney(item.fromAssetId) ? amount : 0);
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
            return generateExcelBuffer({ sheetName: "Money Flow", columns, rows, summary });
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