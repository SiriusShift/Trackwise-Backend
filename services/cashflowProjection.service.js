import moment from "moment-timezone";
import { getUserTimezone } from "../utils/userTimezone.js";
import { getCreditItems, getRecurringItems, priorityRank } from "./schedules.service.js";
import { getLiquidBalance, LIQUID_CATEGORIES } from "./transactions.service.js";

export const getCashflowProjection = async (userId, range = 30) => {
    const days = Math.min(Math.max(Number(range) || 30, 1), 365);
    const tz = await getUserTimezone(userId);
    const today = moment().tz(tz).startOf("day");
    const end = today.clone().add(days - 1, "days");
    const to = end.clone().endOf("day").toDate();

    const [liquidBalance, recurring, credit] = await Promise.all([
        getLiquidBalance(userId, today.clone().endOf("day").toDate(), { categories: LIQUID_CATEGORIES }),
        getRecurringItems(userId, tz, { from: null, to }),
        getCreditItems(userId, tz, today.toDate(), to),
    ]);

    const startingBalance = liquidBalance.total
    let endingBalance = startingBalance;
    let inflow = 0;
    let outflow = 0;
    let lowest = null;
    const included = new Set(liquidBalance.assetIds);


    // How an item moves spendable cash; 0 = doesn't touch it.
    const cashEffect = (item) => {
        const from = item.fromAsset?.id;
        const to = item.toAsset?.id;
        if (item.source === "CREDIT_STATEMENT") return -item.amount;
        if (item.type === "Income") return !to || included.has(to) ? item.amount : 0;
        if (item.type === "Expense") return !from || included.has(from) ? -item.amount : 0;
        // Transfer: in minus out, so between two included accounts it nets to 0.
        return (included.has(to) ? item.amount : 0) - (included.has(from) ? item.amount : 0);
    };

    const points = [...recurring, ...credit].sort((a, b) => {
        const rankDiff = priorityRank(a, today) - priorityRank(b, today);
        return rankDiff || new Date(a.dueDate) - new Date(b.dueDate);
    }).reduce((acc, curr) => {
        const due = moment(curr.dueDate).tz(tz);
        if (due.isAfter(end, "day")) return acc;

        const overdue = due.isBefore(today, "day");
        const groupKey = overdue ? today.format("YYYY-MM-DD") : due.format("YYYY-MM-DD");
        const amount = cashEffect(curr);
        if (amount === 0) return acc;

        if (amount < 0) outflow += Math.abs(amount);
        if (amount > 0) inflow += amount;
        endingBalance += amount;

        const group = (acc[groupKey] ??= { date: groupKey, balance: startingBalance, inflow: 0, outflow: 0, events: [] });
        if (amount < 0) group.outflow += Math.abs(amount);
        if (amount > 0) group.inflow += amount;
        group.balance = endingBalance; // running balance after this item

        if (!lowest || endingBalance < lowest.amount) lowest = { date: groupKey, amount: endingBalance };

        group.events.push({
            label: curr.description,
            amount: amount.toFixed(2),
            source: curr.source,
            projected: curr.projected,
            overdue,
        });
        return acc;

    }, {});

    const byDate = points; // the reduce result
    let balance = startingBalance;
    const series = [];
    for (let d = today.clone(); !d.isAfter(end, "day"); d.add(1, "day")) {
        const key = d.format("YYYY-MM-DD");
        const p = byDate[key];
        if (p) balance = p.balance;
        series.push(p ?? { date: key, balance, inflow: 0, outflow: 0, events: [] });
    }


    return {
        days,
        totals: { inflow: inflow.toFixed(2), outflow: outflow.toFixed(2) },
        from: today.format("YYYY-MM-DD"),
        to: end.format("YYYY-MM-DD"),
        startingBalance: startingBalance.toFixed(2),
        lowest: { ...lowest, amount: lowest.amount.toFixed(2) },
        endingBalance: endingBalance.toFixed(2),
        points: series,
    };
};
