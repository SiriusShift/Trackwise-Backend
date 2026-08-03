import moment from "moment";
import { prisma } from "../config/prisma.js";
import { getAssetBalance } from "./assets.service.js";

export const getTransactionStatement = async ({ userId, assetId, from, to }) => {
    // subtract 1ms so transactions exactly on `from` aren't double-counted
    const openingDate = moment(from).startOf("day");

    const openingResult = await getAssetBalance(userId, assetId, openingDate);
    const openingBalance = openingResult.remainingBalance;


    const filters = {
        isActive: true,
        userId: Number(userId),
        status: "Completed",
    };

    const [expenses, incomes, transfers] = await Promise.all([
        prisma.expense.findMany({
            where: { ...filters, assetId: Number(assetId), date: { gte: from, lte: to } },
            select: {
                id: true, date: true, amount: true, description: true, status: true,
                category: { select: { name: true } },
            },
        }),
        prisma.income.findMany({
            where: { ...filters, assetId: Number(assetId), date: { gte: from, lte: to } },
            select: {
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
        id: item.id,
        type: "Expense",
        credit: 0,
        debit: Number(item.amount),
        description: item.description,
        date: item.date,
        category: item.category,
    }));

    const formattedIncomes = incomes.map((item) => ({
        id: item.id,
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
            id: item.id,
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

    console.log(openingBalance)

    const withBalance = mergedTransactions.map((tx) => {
        console.log("Before:", runningBalance);

        totalCredit += tx.credit;
        totalDebit += tx.debit;
        runningBalance += tx.credit - tx.debit;

        console.log("After:", runningBalance);

        return { ...tx, balance: runningBalance };
    });

    return {
        openingBalance,
        closingBalance: runningBalance,
        totalCredit,
        totalDebit,
        transactions: withBalance,
    };
};