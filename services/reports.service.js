import moment from "moment";
import Papa from "papaparse";
import { prisma } from "../config/prisma.js";
import { getAssetBalance } from "./assets.service.js";
import { generateExcelBuffer } from "./excel.service.js";

export const getTransactionStatement = async ({ userId, assetId, from: fromDate, to: toDate, format }) => {
    const from = moment(fromDate).startOf("day").toDate();
    const to = moment(toDate).endOf("day").toDate();
    const openingResult = await getAssetBalance(userId, assetId, { asOf: fromDate }); console.log(openingResult)
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
            date: moment(tx.date).format("YYYY-MM-DD hh:mm A"),
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