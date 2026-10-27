/*
|--------------------------------------------------------------------------
| Demo data seed (screenshots / manual testing)
|--------------------------------------------------------------------------
| Creates (or resets) a dedicated demo user and fills it with ~6 months of
| realistic data: categories, accounts (cash, bank, e-wallet, credit card,
| loan, investment), expenses, incomes, transfers, recurring transactions
| (+ logs), budgets (category limits), savings goals and notifications.
|
| Usage (from Trackwise-Backend):
|   npm run seed:demo -- --yes
|   SEED_EMAIL=pathalertdev@gmail.com SEED_USER_ID=16 npm run seed:demo -- --yes   (existing account; password untouched)
|
| Login:  demo@trackwise.app / Demo@1234   (override with SEED_EMAIL / SEED_PASSWORD)
|
| Safety:
|  - Only ever touches the demo user's own rows. If SEED_EMAIL belongs to a
|    user whose username isn't "demo-seed", the script aborts.
|  - Prints the target DB host and refuses to run without --yes.
|  - Re-running wipes and regenerates the demo user's data (idempotent).
|  - Dates are relative to "today", so re-run before taking new screenshots.
*/
import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EMAIL = process.env.SEED_EMAIL ?? "demo@trackwise.app";
// When set, seed into this existing account (email must match) and leave its password alone.
const TARGET_USER_ID = process.env.SEED_USER_ID ? Number(process.env.SEED_USER_ID) : null;
const PASSWORD = process.env.SEED_PASSWORD ?? "Demo@1234";
const USERNAME = "demo-seed";
const MONTHS_BACK = 5; // this month + 5 previous ones

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/
// Deterministic PRNG so every run produces the same-looking data.
const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rand = mulberry32(20261013);
const between = (min, max) => min + rand() * (max - min);
const roundTo = (n, step) => Math.round(n / step) * step;
const money = (min, max, step = 5) => roundTo(between(min, max), step);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const now = new Date();
const TODAY = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4),
);

// 04:00 UTC = 12:00 noon in Asia/Manila, so the calendar day never shifts.
const dayOf = (monthsAgo, day) => {
  const y = TODAY.getUTCFullYear();
  const m = TODAY.getUTCMonth() - monthsAgo;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last), 4));
};
const daysInMonth = (monthsAgo) => dayOf(monthsAgo, 31).getUTCDate();
const isPast = (date) => date <= TODAY;
const fmt = (n) => n.toLocaleString("en-PH", { minimumFractionDigits: 2 });

/*
|--------------------------------------------------------------------------
| Static definitions
|--------------------------------------------------------------------------
*/
const CATEGORIES = [
  // Expense
  ["Groceries", "Expense", "ShoppingCart", "#22C55E"],
  ["Dining", "Expense", "Utensils", "#F97316"],
  ["Transport", "Expense", "Bus", "#3B82F6"],
  ["Rent", "Expense", "House", "#8B5CF6"],
  ["Utilities", "Expense", "Zap", "#EAB308"],
  ["Internet", "Expense", "Wifi", "#06B6D4"],
  ["Subscriptions", "Expense", "Tv", "#EC4899"],
  ["Health", "Expense", "HeartPulse", "#EF4444"],
  ["Shopping", "Expense", "ShoppingBag", "#A855F7"],
  ["Entertainment", "Expense", "Clapperboard", "#F43F5E"],
  ["Education", "Expense", "GraduationCap", "#0EA5E9"],
  ["Travel", "Expense", "Plane", "#14B8A6"],
  ["Personal Care", "Expense", "Scissors", "#D946EF"],
  ["Insurance", "Expense", "ShieldCheck", "#64748B"],
  ["Loan Payment", "Expense", "HandCoins", "#B45309"],
  ["Gifts", "Expense", "Gift", "#FB7185"],
  ["Mobile Load", "Expense", "Smartphone", "#84CC16"],
  // Income
  ["Salary", "Income", "Briefcase", "#16A34A"],
  ["Freelance", "Income", "Laptop", "#0D9488"],
  ["Dividends", "Income", "TrendingUp", "#2563EB"],
  ["Cashback", "Income", "Coins", "#CA8A04"],
  ["Interest", "Income", "Landmark", "#7C3AED"],
  ["Gifts Received", "Income", "Gift", "#DB2777"],
  // Transfer
  ["Savings", "Transfer", "PiggyBank", "#10B981"],
  ["Credit Card Payment", "Transfer", "CreditCard", "#6366F1"],
  ["Cash Withdrawal", "Transfer", "Banknote", "#78716C"],
  ["Wallet Top Up", "Transfer", "Wallet", "#0891B2"],
];

// Daily-ish spending: [category, per-month count range, amount range, step, accounts, descriptions]
const SPENDING = [
  ["Groceries", [4, 5], [900, 3200], 5, ["BPI Checking", "Cash Wallet", "Metrobank Credit Card"],
    ["SM Supermarket", "Puregold weekly groceries", "Landers bulk buy", "Wet market - meat & veggies", "Robinsons Supermarket"]],
  ["Dining", [7, 9], [180, 1450], 5, ["GCash", "Cash Wallet", "Metrobank Credit Card"],
    ["Jollibee", "Starbucks coffee", "Dinner with friends", "Mang Inasal", "Samgyupsal night", "McDonald's", "Ramen Nagi", "Lunch at work", "Milk tea"]],
  ["Transport", [8, 11], [40, 480], 1, ["GCash", "Cash Wallet"],
    ["Grab ride", "MRT/LRT reload", "Jeepney fare", "Gas - Shell", "Angkas", "Parking fee", "Toll fee"]],
  ["Shopping", [1, 3], [600, 4200], 10, ["Metrobank Credit Card", "GCash"],
    ["Uniqlo", "Shopee order", "Lazada haul", "New sneakers", "Home essentials", "SM Department Store"]],
  ["Entertainment", [1, 3], [250, 1600], 5, ["GCash", "Metrobank Credit Card"],
    ["Movie tickets", "Concert ticket", "Steam game", "Bowling night", "Arcade"]],
  ["Health", [0, 2], [350, 2800], 5, ["BPI Checking", "GCash"],
    ["Pharmacy - Mercury Drug", "Dental cleaning", "Vitamins", "Clinic consultation"]],
  ["Personal Care", [1, 2], [250, 1100], 5, ["Cash Wallet", "GCash"],
    ["Haircut", "Salon", "Skincare", "Barber"]],
  ["Mobile Load", [1, 2], [100, 500], 50, ["GCash"],
    ["Globe load", "Smart load", "Data promo"]],
  ["Gifts", [0, 1], [500, 2500], 50, ["BPI Checking", "GCash"],
    ["Birthday gift", "Christening gift", "Christmas exchange gift"]],
];

const ACCOUNTS = [
  { name: "Cash Wallet", category: "CASH", subtype: null, balance: 25000, color: "#16A34A", institution: null },
  { name: "BDO Savings", category: "BANK", subtype: "SAVINGS", balance: 85000, color: "#2563EB", institution: "BDO" },
  { name: "BPI Checking", category: "BANK", subtype: "CHECKING", balance: 65000, color: "#DC2626", institution: "BPI" },
  { name: "GCash", category: "BANK", subtype: "E_WALLET", balance: 20000, color: "#0EA5E9", institution: "GCash" },
  { name: "Metrobank Credit Card", category: "CREDIT", subtype: "CREDIT_CARD", balance: 0, color: "#7C3AED", institution: "Metrobank",
    creditDetail: { creditLimit: 80000, statementDate: 25, dueDate: 15 } },
  { name: "Personal Loan", category: "LOAN", subtype: "PERSONAL", balance: 0, color: "#B45309", institution: "Security Bank",
    includeInNetWorth: true },
  { name: "COL Financial", category: "INVESTMENT", subtype: "STOCK", balance: 0, color: "#0D9488", institution: "COL Financial" },
];

/*
|--------------------------------------------------------------------------
| Main
|--------------------------------------------------------------------------
*/
const assertSafeToRun = () => {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.replace(/^.*@/, "").replace(/[/?].*$/, "") || "(unset)";
  console.log(`Target database host: ${host}`);
  console.log(`Demo user: ${EMAIL}`);
  if (!process.argv.includes("--yes")) {
    console.log("\nRefusing to run without --yes. This will WIPE and recreate all data for the demo user above.");
    process.exit(1);
  }
};

const resetUser = async () => {
  const existing = TARGET_USER_ID
    ? await prisma.user.findUnique({ where: { id: TARGET_USER_ID } })
    : await prisma.user.findUnique({ where: { email: EMAIL } });
  if (TARGET_USER_ID && (!existing || existing.email !== EMAIL)) {
    throw new Error(`User #${TARGET_USER_ID} not found or its email isn't ${EMAIL}.`);
  }
  if (existing && !TARGET_USER_ID && existing.username !== USERNAME) {
    throw new Error(
      `${EMAIL} belongs to a real user (username "${existing.username}"). Refusing to wipe it. Set SEED_EMAIL to something else.`,
    );
  }

  const password = await bcrypt.hash(PASSWORD, 10);

  if (!existing) {
    const user = await prisma.user.create({
      data: {
        email: EMAIL,
        username: USERNAME,
        firstName: "Alex",
        lastName: "Rivera",
        password,
        role: "user",
        hasSeenTour: true,
        settings: {
          create: {
            timezone: "Asia/Manila",
            timeFormat: "hh:mm A",
            currency: "PHP",
            weekStartDay: 0,
            recurringBehaviour: "REMIND",
            emailNotification: false,
            mobileNotification: false,
            notifyDays: 2,
          },
        },
      },
    });
    return user;
  }

  const userId = existing.id;
  const recurring = { recurring: { userId } };
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.recurringLog.deleteMany({ where: recurring }),
    prisma.loanInstallment.deleteMany({ where: { loan: { asset: { userId } } } }),
    prisma.transfer.deleteMany({ where: { userId } }),
    prisma.expense.deleteMany({ where: { userId } }),
    prisma.income.deleteMany({ where: { userId } }),
    prisma.recurringTransaction.deleteMany({ where: { userId } }),
    prisma.categoryTracker.deleteMany({ where: { userId } }),
    prisma.savingsGoal.deleteMany({ where: { userId } }),
    prisma.asset.deleteMany({ where: { userId } }), // cascades credit/loan/investment details
    prisma.categories.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { hasSeenTour: true, isActive: true, ...(TARGET_USER_ID ? {} : { password }) },
    }),
    prisma.settings.upsert({
      where: { userId },
      update: { currency: "PHP" },
      create: { userId, timezone: "Asia/Manila", timeFormat: "hh:mm A", currency: "PHP", notifyDays: 2 },
    }),
  ]);
  return existing;
};

const main = async () => {
  assertSafeToRun();
  const user = await resetUser();
  const userId = user.id;
  console.log(`\nSeeding user #${userId} ...`);

  // ---- Categories ----------------------------------------------------------
  await prisma.categories.createMany({
    data: CATEGORIES.map(([name, type, icon, color]) => ({ name, type, icon, color, userId })),
  });
  const cats = {};
  for (const c of await prisma.categories.findMany({ where: { userId } })) {
    cats[`${c.type}:${c.name}`] = c.id;
  }
  const cat = (type, name) => {
    const id = cats[`${type}:${name}`];
    if (!id) throw new Error(`Missing category ${type}:${name}`);
    return id;
  };

  // ---- Accounts ------------------------------------------------------------
  const assets = {};
  for (const a of ACCOUNTS) {
    const created = await prisma.asset.create({
      data: {
        name: a.name,
        category: a.category,
        subtype: a.subtype,
        balance: a.balance,
        currency: "PHP",
        color: a.color,
        institution: a.institution,
        includeInNetWorth: true,
        openedAt: dayOf(MONTHS_BACK + 2, 1),
        userId,
        ...(a.creditDetail && { creditDetail: { create: a.creditDetail } }),
      },
      include: { creditDetail: true },
    });
    assets[a.name] = created;
  }
  const A = (name) => assets[name].id;
  const card = assets["Metrobank Credit Card"];

  // In-memory ledger so we can print balances and size credit statements.
  const expenses = []; // plain rows for createMany
  const incomes = [];
  const transfers = [];
  const addExpense = (date, description, amount, categoryName, assetName, extra = {}) => {
    if (!isPast(date)) return;
    expenses.push({
      date, description, amount, status: "Completed", userId,
      categoryId: cat("Expense", categoryName), assetId: A(assetName), ...extra,
    });
  };

  // ---- Recurring templates -------------------------------------------------
  // [key, type, description, amount, day, category, from, to, behaviour, status]
  const RECURRING = [
    ["rent", "Expense", "Apartment rent", 12000, 1, "Rent", "BPI Checking", null, "REMIND", "ACTIVE"],
    ["internet", "Expense", "Converge Fiber 100Mbps", 1699, 8, "Internet", "BPI Checking", null, "REMIND", "ACTIVE"],
    ["netflix", "Expense", "Netflix Premium", 549, 20, "Subscriptions", "Metrobank Credit Card", null, "AUTO_LOG", "ACTIVE"],
    ["spotify", "Expense", "Spotify Duo", 149, 12, "Subscriptions", "Metrobank Credit Card", null, "AUTO_LOG", "ACTIVE"],
    ["gym", "Expense", "Gym membership", 1500, 3, "Health", "BPI Checking", null, "REMIND", "PAUSED"],
    ["insurance", "Expense", "Life insurance premium", 18000, 18, "Insurance", "BPI Checking", null, "REMIND", "ACTIVE", { unit: "year", months: 12 }],
    ["salary1", "Income", "Salary - 15th", 27500, 15, "Salary", "BPI Checking", null, "AUTO_LOG", "ACTIVE"],
    ["salary2", "Income", "Salary - 30th", 27500, 30, "Salary", "BPI Checking", null, "AUTO_LOG", "ACTIVE"],
    ["savings", "Transfer", "Monthly savings", 8000, 16, "Savings", "BPI Checking", "BDO Savings", "AUTO_LOG", "ACTIVE"],
    ["cardpay", "Transfer", "Credit card payment", 0, 15, "Credit Card Payment", "BPI Checking", "Metrobank Credit Card", "REMIND", "ACTIVE"],
  ];

  const templates = {};
  const occurrences = {}; // key -> past occurrence dates
  for (const [key, type, description, amount, day, catName, from, to, behaviour, status, opt] of RECURRING) {
    const stepMonths = opt?.months ?? 1;
    const unit = opt?.unit ?? "month";
    const dates = [];
    for (let m = MONTHS_BACK; m >= 0; m--) {
      const d = dayOf(m, day);
      if (stepMonths === 12) continue; // yearly: handled below
      dates.push(d);
    }
    const past = dates.filter(isPast);
    let first = past[0] ?? dayOf(0, day);
    let next = dates.find((d) => !isPast(d)) ?? dayOf(-1, day);
    if (stepMonths === 12) {
      first = dayOf(MONTHS_BACK, day);
      next = new Date(Date.UTC(TODAY.getUTCFullYear() + (dayOf(0, day) > TODAY ? 0 : 1), 11, day, 4));
    }
    const paused = status === "PAUSED";
    const t = await prisma.recurringTransaction.create({
      data: {
        type, description, amount: amount || 10000, interval: 1, unit, behaviour, status,
        startDate: first, nextDueDate: next,
        lastTriggeredAt: past.length && stepMonths !== 12 ? past[past.length - 1] : null,
        isActive: true,
        userId,
        categoryId: cat(type, catName),
        fromAssetId: A(from),
        toAssetId: to ? A(to) : null,
      },
    });
    templates[key] = t;
    occurrences[key] = paused ? past.slice(0, 3) : past; // paused ~3 months ago
  }
  // An ended one, for the "Ended" tab.
  const ended = await prisma.recurringTransaction.create({
    data: {
      type: "Expense", description: "Magazine subscription", amount: 320, interval: 1, unit: "month",
      behaviour: "AUTO_LOG", status: "ENDED", startDate: dayOf(MONTHS_BACK + 4, 10),
      nextDueDate: dayOf(MONTHS_BACK, 10), endDate: dayOf(MONTHS_BACK, 10), endedAt: dayOf(MONTHS_BACK, 10),
      userId, categoryId: cat("Expense", "Entertainment"), fromAssetId: A("GCash"),
    },
  });

  const logs = [];
  const linkedExpense = async (key, date, amount = templates[key].amount, desc = templates[key].description) => {
    const t = templates[key];
    const row = await prisma.expense.create({
      data: {
        date, description: desc, amount, status: "Completed", userId,
        categoryId: t.categoryId, assetId: t.fromAssetId, recurringId: t.id, recurringDueDate: date,
      },
    });
    expenses.push(row);
    logs.push({ result: "CREATED", firedAt: date, recurringId: t.id, generatedExpenseId: row.id });
    return row;
  };

  // Fixed monthly bills --------------------------------------------------
  for (const d of occurrences.rent) await linkedExpense("rent", d);
  for (const d of occurrences.internet) await linkedExpense("internet", d);
  for (const d of occurrences.netflix) await linkedExpense("netflix", d);
  for (const d of occurrences.spotify) await linkedExpense("spotify", d);
  for (const d of occurrences.gym) await linkedExpense("gym", d);
  const insDate = dayOf(MONTHS_BACK, 18);
  if (isPast(insDate)) await linkedExpense("insurance", insDate);
  for (let i = 0; i < 4; i++) {
    const d = dayOf(MONTHS_BACK + 4 - i, 10);
    if (isPast(d) && d < dayOf(MONTHS_BACK, 10)) {
      const row = await prisma.expense.create({
        data: { date: d, description: "Magazine subscription", amount: 320, status: "Completed", userId,
          categoryId: ended.categoryId, assetId: A("GCash"), recurringId: ended.id, recurringDueDate: d },
      });
      expenses.push(row);
    }
  }

  // Utilities (variable) --------------------------------------------------
  for (let m = MONTHS_BACK; m >= 0; m--) {
    addExpense(dayOf(m, 10), "Meralco electric bill", money(2100, 3600), "Utilities", "BPI Checking");
    addExpense(dayOf(m, 12), "Maynilad water bill", money(380, 560), "Utilities", "BPI Checking");
  }

  // Salaries (auto-logged) ------------------------------------------------
  for (const key of ["salary1", "salary2"]) {
    for (const d of occurrences[key]) {
      const t = templates[key];
      const row = await prisma.income.create({
        data: { date: d, description: t.description, amount: t.amount, status: "Completed", userId,
          categoryId: t.categoryId, assetId: t.fromAssetId, recurringId: t.id },
      });
      incomes.push(row);
      logs.push({ result: "CREATED", firedAt: d, recurringId: t.id, generatedIncomeId: row.id });
    }
  }

  // Other income ----------------------------------------------------------
  const freelanceClients = ["Logo design - Kape Co.", "Website landing page", "Social media graphics", "Brand refresh retainer", "Video editing gig"];
  for (let m = MONTHS_BACK; m >= 0; m--) {
    const jobs = m % 2 === 0 ? 2 : 1;
    for (let j = 0; j < jobs; j++) {
      const d = dayOf(m, Math.floor(between(3, 27)));
      if (isPast(d))
        incomes.push({ date: d, description: pick(freelanceClients), amount: money(3500, 14000, 100), status: "Completed", userId,
          categoryId: cat("Income", "Freelance"), assetId: A(j % 2 ? "GCash" : "BPI Checking") });
    }
    const cb = dayOf(m, 22);
    if (isPast(cb)) incomes.push({ date: cb, description: "Credit card cashback", amount: money(120, 480), status: "Completed", userId,
      categoryId: cat("Income", "Cashback"), assetId: A("BPI Checking") });
    const int = dayOf(m, 28);
    if (isPast(int)) incomes.push({ date: int, description: "Savings interest", amount: money(60, 140, 1), status: "Completed", userId,
      categoryId: cat("Income", "Interest"), assetId: A("BDO Savings") });
  }
  for (const m of [4, 1]) {
    const d = dayOf(m, 20);
    if (isPast(d)) incomes.push({ date: d, description: "Stock dividends - ALI", amount: money(850, 1400, 10), status: "Completed", userId,
      categoryId: cat("Income", "Dividends"), assetId: A("BDO Savings") });
  }
  incomes.push({ date: dayOf(2, 14), description: "Birthday money from Tita", amount: 3000, status: "Completed", userId,
    categoryId: cat("Income", "Gifts Received"), assetId: A("Cash Wallet") });

  // Day-to-day spending ---------------------------------------------------
  for (let m = MONTHS_BACK; m >= 0; m--) {
    for (const [catName, [lo, hi], [amin, amax], step, accts, descs] of SPENDING) {
      const count = Math.floor(between(lo, hi + 1));
      for (let i = 0; i < count; i++) {
        const day = Math.min(daysInMonth(m), Math.max(1, Math.round(between(1, 28))));
        addExpense(dayOf(m, day), pick(descs), money(amin, amax, step), catName, pick(accts));
      }
    }
  }
  // A few one-off big items so charts have texture.
  addExpense(dayOf(3, 9), "Round trip flight to Cebu", 6850, "Travel", "Metrobank Credit Card");
  addExpense(dayOf(3, 10), "Cebu hotel - 3 nights", 7200, "Travel", "Metrobank Credit Card");
  addExpense(dayOf(3, 11), "Island hopping tour", 2400, "Travel", "Cash Wallet");
  addExpense(dayOf(1, 6), "Online course - UX fundamentals", 4500, "Education", "Metrobank Credit Card");
  addExpense(dayOf(2, 21), "Mechanical keyboard", 5290, "Shopping", "Metrobank Credit Card");
  addExpense(dayOf(0, 6), "Weekend staycation", 5600, "Travel", "Metrobank Credit Card");

  // ---- Loan: 120k add-on, 12 months, 1%/month ------------------------------
  const loan = assets["Personal Loan"];
  const loanStart = dayOf(4, 5); // first installment due one month later
  const principal = 120000;
  const monthlyInterest = principal * 0.01;
  const perPrincipal = principal / 12;
  const loanDetail = await prisma.loanDetail.create({
    data: {
      assetId: loan.id, originalPrincipal: principal, interestRate: 1, interestPeriod: "MONTHLY",
      interestMethod: "ADD_ON", termMonths: 12, minimumPayment: perPrincipal + monthlyInterest,
      startDate: loanStart, nextDueDate: null,
    },
  });
  let paidPrincipal = 0;
  let nextLoanDue = null;
  for (let n = 1; n <= 12; n++) {
    const due = dayOf(4 - n, 5);
    const amountDue = perPrincipal + monthlyInterest;
    let expenseId = null;
    let status = "PENDING";
    let paidAt = null;
    let amountPaid = 0;
    if (isPast(due)) {
      const exp = await prisma.expense.create({
        data: { date: due, description: `Personal loan - installment ${n}/12`, amount: amountDue, status: "Completed", userId,
          categoryId: cat("Expense", "Loan Payment"), assetId: A("BPI Checking") },
      });
      expenses.push(exp);
      expenseId = exp.id; status = "PAID"; paidAt = due; amountPaid = amountDue;
      paidPrincipal += perPrincipal;
    } else if (!nextLoanDue) {
      nextLoanDue = due;
    }
    await prisma.loanInstallment.create({
      data: { loanId: loanDetail.id, installmentNo: n, dueDate: due, principal: perPrincipal, interest: monthlyInterest,
        amountDue, amountPaid, status, expenseId, paidAt },
    });
  }
  await prisma.loanDetail.update({ where: { id: loanDetail.id }, data: { nextDueDate: nextLoanDue } });
  await prisma.asset.update({ where: { id: loan.id }, data: { balance: principal - paidPrincipal } });

  // ---- Credit card statements + payments -----------------------------------
  // Statement cycle closes on the 25th; due on the 15th of the following month.
  const cardCharges = (from, to) =>
    expenses.filter((e) => e.assetId === card.id && e.date > from && e.date <= to).reduce((s, e) => s + Number(e.amount), 0);

  const statementRows = [];
  for (let m = MONTHS_BACK; m >= 0; m--) {
    const closing = dayOf(m, 25);
    if (!isPast(closing)) continue;
    const prev = dayOf(m + 1, 25);
    const balance = cardCharges(prev, closing);
    if (balance <= 0) continue;
    const due = dayOf(m - 1, 15);
    statementRows.push({ closing, due, balance });
  }
  for (const s of statementRows) {
    const paid = isPast(s.due);
    const statement = await prisma.creditStatement.create({
      data: {
        creditDetailId: card.creditDetail.id, statementDate: s.closing, dueDate: s.due,
        statementBalance: s.balance,
        status: paid ? "PAID" : "PENDING",
      },
    });
    if (paid) {
      transfers.push({
        date: s.due, description: "Metrobank card payment", amount: s.balance, status: "Completed", userId,
        categoryId: cat("Transfer", "Credit Card Payment"), fromAssetId: A("BPI Checking"), toAssetId: card.id,
        creditStatementId: statement.id,
      });
    }
  }

  // ---- Other transfers -----------------------------------------------------
  for (const d of occurrences.savings) {
    const t = templates.savings;
    const row = await prisma.transfer.create({
      data: { date: d, description: t.description, amount: t.amount, status: "Completed", userId,
        categoryId: t.categoryId, fromAssetId: t.fromAssetId, toAssetId: t.toAssetId, recurringId: t.id },
    });
    transfers.push(row);
    logs.push({ result: "CREATED", firedAt: d, recurringId: t.id, generatedTransferId: row.id });
  }
  for (let m = MONTHS_BACK; m >= 0; m--) {
    const gc = dayOf(m, 2);
    if (isPast(gc)) transfers.push({ date: gc, description: "Top up GCash", amount: 3000, status: "Completed", userId,
      categoryId: cat("Transfer", "Wallet Top Up"), fromAssetId: A("BPI Checking"), toAssetId: A("GCash") });
    const atm = dayOf(m, 5);
    if (isPast(atm)) transfers.push({ date: atm, description: "ATM withdrawal", amount: 2000, status: "Completed", userId,
      categoryId: cat("Transfer", "Cash Withdrawal"), fromAssetId: A("BPI Checking"), toAssetId: A("Cash Wallet") });
  }
  // Card-payment recurring log entries (history of reminders).
  for (const s of statementRows.filter((r) => isPast(r.due))) {
    logs.push({ result: "REMINDED", firedAt: s.due, recurringId: templates.cardpay.id });
  }
  // Skipped / failed examples for the logs view.
  logs.push({ result: "SKIPPED", firedAt: dayOf(MONTHS_BACK, 3), recurringId: templates.gym.id });
  logs.push({ result: "FAILED", firedAt: dayOf(2, 3), recurringId: templates.gym.id, errorMessage: "Insufficient balance in BPI Checking" });

  // ---- Investment position -------------------------------------------------
  const inv = assets["COL Financial"];
  await prisma.investmentPosition.create({
    data: { assetId: inv.id, symbol: "ALI", quantity: 500, averageCostBasis: 24.35, valuationCurrency: "PHP",
      lastPrice: 27.5, lastPriceAt: TODAY },
  });
  await prisma.asset.update({ where: { id: inv.id }, data: { balance: 500 * 27.5 } });

  // ---- Bulk insert --------------------------------------------------------
  // Rows already created individually (those with an id) are skipped.
  const fresh = (rows) => rows.filter((r) => r.id === undefined);
  await prisma.expense.createMany({ data: fresh(expenses) });
  await prisma.income.createMany({ data: fresh(incomes) });
  await prisma.transfer.createMany({ data: fresh(transfers) });
  await prisma.recurringLog.createMany({ data: logs, skipDuplicates: true });

  // ---- Budgets (category limits) -------------------------------------------
  const budgets = [
    ["Groceries", 10000, "monthly"],
    ["Dining", 6000, "monthly"],
    ["Transport", 4000, "monthly"],
    ["Shopping", 5000, "monthly"],
    ["Entertainment", 3000, "monthly"],
    ["Utilities", 6000, "monthly"],
    ["Health", 2500, "monthly"],
    ["Travel", 60000, "yearly"],
  ];
  await prisma.categoryTracker.createMany({
    data: budgets.map(([name, limit, period]) => ({ userId, categoryId: cat("Expense", name), limit, period })),
  });

  // ---- Savings goals -------------------------------------------------------
  await prisma.savingsGoal.createMany({
    data: [
      { name: "Emergency Fund", targetAmount: 200000, targetDate: new Date(Date.UTC(2027, 5, 30, 4)), assetId: A("BDO Savings"), icon: "ShieldCheck", userId },
      { name: "Japan Trip", targetAmount: 150000, targetDate: new Date(Date.UTC(2027, 3, 1, 4)), currentAmount: 42000, icon: "Plane", userId },
      { name: "New Laptop", targetAmount: 65000, targetDate: new Date(Date.UTC(2026, 11, 20, 4)), currentAmount: 30000, icon: "Laptop", userId },
    ],
  });

  // ---- Notifications -------------------------------------------------------
  const hoursAgo = (h) => new Date(TODAY.getTime() - h * 3600_000);
  await prisma.notification.createMany({
    data: [
      { userId, type: "Reminder", title: "Credit card payment due soon", message: "Your Metrobank statement is due on the 15th. Pay it from BPI Checking to avoid late fees.", recurringId: templates.cardpay.id, createdAt: hoursAgo(2) },
      { userId, type: "Reminder", title: "Rent due in 19 days", message: "Apartment rent of ₱12,000.00 is scheduled for the 1st.", recurringId: templates.rent.id, createdAt: hoursAgo(6) },
      { userId, type: "Warning", title: "Dining budget almost used", message: "You've used over 80% of your monthly Dining budget.", createdAt: hoursAgo(20) },
      { userId, type: "Success", title: "Salary logged", message: "Salary - 15th of ₱27,500.00 was added to BPI Checking.", isRead: true, readAt: hoursAgo(70), createdAt: hoursAgo(80) },
      { userId, type: "Info", title: "Loan installment paid", message: "Personal loan installment 4/12 was recorded.", isRead: true, readAt: hoursAgo(200), createdAt: hoursAgo(210) },
      { userId, type: "General", title: "Welcome to Trackwise", message: "Track expenses, budgets and accounts all in one place.", isRead: true, readAt: hoursAgo(500), createdAt: hoursAgo(520) },
    ],
  });

  // ---- Summary -------------------------------------------------------------
  const sum = (rows, f) => rows.filter(f).reduce((s, r) => s + Number(r.amount), 0);
  console.log("\nCounts:");
  console.log(`  categories ${CATEGORIES.length} | accounts ${ACCOUNTS.length} | expenses ${expenses.length} | incomes ${incomes.length} | transfers ${transfers.length}`);
  console.log(`  recurring ${RECURRING.length + 1} | budgets ${budgets.length} | goals 3 | notifications 6`);
  console.log("\nComputed account balances (same formula as the API):");
  const final = await prisma.asset.findMany({ where: { userId } });
  for (const a of final) {
    const inc = sum(incomes, (r) => r.assetId === a.id);
    const exp = sum(expenses, (r) => r.assetId === a.id);
    const out = sum(transfers, (r) => r.fromAssetId === a.id);
    const inn = sum(transfers, (r) => r.toAssetId === a.id);
    const bal = a.category === "CREDIT"
      ? Number(a.balance) + exp - inc + out - inn
      : Number(a.balance) + inc - exp - out + inn;
    console.log(`  ${a.name.padEnd(24)} ${fmt(bal).padStart(14)}${bal < 0 && a.category !== "CREDIT" ? "   <-- negative!" : ""}`);
  }
  console.log(`\nDone. Log in as ${EMAIL} / ${PASSWORD}`);
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
