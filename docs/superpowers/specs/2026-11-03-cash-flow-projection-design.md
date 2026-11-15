# Cash Flow Projection Widget — Design

Date: 2026-11-03
Status: Draft for review
Repos: Trackwise-Backend, Trackwise-Frontend

## Goal

A dashboard widget that answers **"Will I run short?"**: a running balance of
spendable money (cash + bank) for the next 30, 60 or 90 days, built only from
items the user has already scheduled. It highlights the lowest point and the
first day the balance goes negative.

### Agreed decisions

| Decision | Choice |
|---|---|
| Question answered | Running balance of spendable money, not monthly in/out bars |
| Inputs (phase 1) | Scheduled items only. Every point traces back to a user-entered item |
| Starting balance | Active CASH + BANK accounts with `includeInNetWorth = true` |
| Range | Toggle 30 / 60 / 90 days, default 30, remembered per browser |
| Where logic lives | Backend endpoint; the frontend only draws |

### Out of scope (phase 1)

- Estimated everyday spending from history ("realistic forecast"). Phase 2,
  added as an extra event source plus a second chart line. The design below
  leaves room for it.
- Per-account projections, editing or paying items from the widget, and
  multi-currency conversion (matches the Overview widget, which also sums
  `getLiquidBalance` without conversion).

## Backend

### Endpoint

`GET /transactions/cash-flow-projection?days=30`

- `days`: one of `30 | 60 | 90`, default `30` (Joi, in `schema/transaction.js`).
- Range: today (user timezone, start of day) to today + `days − 1`, inclusive.
- Auth: `requireAuth`, same as `/transactions/statistics`.

### Files

| File | Change |
|---|---|
| `utils/cashFlowProjection.js` | **New.** Pure functions, no Prisma: `toEvents()` filter rules and `buildProjection()`. |
| `services/cashFlowProjection.service.js` | **New.** Loads inputs, maps them to events, calls the util. |
| `services/schedules.service.js` | **Changed.** (1) Fix double-counted projected card bill. (2) Add `LOAN_INSTALLMENT` source. |
| `controllers/transactions.controller.js` | Add `getCashFlowProjection` handler (thin, same as `getStatistics`). |
| `routes/transaction.routes.js` | Mount the route. |
| `schema/transaction.js` | Add `getCashFlowProjectionQuery`. |
| `tests/cashFlowProjection.test.js` | **New.** `node:test` unit tests for the util. |

### Data flow

```
getLiquidBalance(userId, now, { categories: LIQUID_CATEGORIES })
      └─► startingBalance + includedAssetIds ──────────┐
getSchedules(userId, { dateFrom, dateTo })              │
      └─► RECURRING + CREDIT_STATEMENT + LOAN_INSTALLMENT ─► toEvents() ─► buildProjection() ─► response
getFutureCardInstallments(userId, from, to)             │
      └─► later-cycle installment amounts ──────────────┘
```

### Event shape (internal)

```js
{
  date: "2026-11-20",     // user-local calendar day
  amount: -10000,          // + money in, − money out
  source: "RECURRING" | "CREDIT_STATEMENT" | "CARD_INSTALLMENT" | "LOAN_INSTALLMENT",
  label: "BPI Card bill",
  projected: false,        // true = estimate (projected statement, future installments)
  overdue: false,
}
```

### Inputs and how each becomes an event

1. **Recurring (ACTIVE only, already filtered by `getRecurringItems`).**
   Every occurrence in range. Account resolved with `getRecurringAccount`.
2. **Open credit statement.** Remaining amount (statement balance − payments),
   on its due date.
3. **Projected next credit statement.** Existing estimate, *minus the open
   statement's remaining amount* (see fix below). Marked `projected`.
4. **Later card installments.** For every ACTIVE `CreditInstallmentPlan`,
   each installment billed on a cycle *after* the projected one and inside the
   range: `monthlyAmount` on `creditDueDate(closeDate)`. Uses the existing
   `billedInstallmentCount` / `dayInMonth` / `creditDueDate` helpers. Marked
   `projected`. Example: phone 6 × ₱5,000, #1 on the open statement, #2 in the
   projected bill, #3–#6 as separate events on Jan–Apr due dates.
5. **Loan installments.** Status `PENDING | PARTIAL | OVERDUE`, due in range or
   overdue: `amountDue + lateFeeCharged − amountPaid`.

### Account filter rules (`toEvents`)

`included` = asset id is in `includedAssetIds` (active CASH/BANK with
`includeInNetWorth`).

| Item | Counted |
|---|---|
| Income / Expense on an included account | Yes |
| Income / Expense on an excluded account | No |
| Income / Expense with no account | Yes (assume spendable) |
| Transfer included → included | No (net zero) |
| Transfer included → excluded or non-cash (e.g. savings sweep) | Yes, outflow |
| Transfer excluded or non-cash → included | Yes, inflow |
| Credit statement, card installment, loan installment | Yes, outflow (payer unknown, assume cash) |

### Fix 1: projected card bill double count

Today `getCreditItems` estimates the next statement from the card's whole
remaining balance, which still contains the unpaid open statement. With ₱10k
unpaid on the open statement and ₱5k new spending, the feed shows ₱10k + ₱15k.
Change: subtract the open statement's remaining amount (floored at 0) from the
estimate. The calendar benefits from the same fix.

Only `getCreditItems` changes (projected bill in the schedules feed and
calendar), where the open bill and the projected bill appear as two separate
payments.

Not changed:

- `getProjectedCreditStatement` (card's "next statement" view): it shows what
  the next statement will say and reports the unpaid open amount separately
  as `carriedOver`, so including it there is intended.
- Statement creation at cycle close: the real statement correctly carries
  forward an unpaid previous balance.

### Fix 2: loans in the schedules feed

Add a `LOAN_INSTALLMENT` source to `getSchedules`, mapped to the existing item
shape (`type: "Expense"`, `source: "LOAN_INSTALLMENT"`, `sourceId`,
`amount`, `dueDate`, `projected: false`). Add `"LOAN_INSTALLMENT"` to the
`source` filter in `getSchedulesQuery`. Display-only in this phase; paying
loan installments keeps its current flow.

### Rules in `buildProjection`

- Overdue items (due before today, still unpaid) are placed on **today**.
- Events are grouped by user-local day. Each day:
  `balance = previous balance + inflow − outflow`.
- One point per day in range, including days with no events.
- `lowest` = the day with the minimum balance; ties pick the earliest.
- `firstNegativeDate` = first day the balance is below 0, else `null`.
- Amounts rounded to 2 decimals per event before summing.

### Response

```json
{
  "data": {
    "days": 30,
    "from": "2026-11-03",
    "to": "2026-12-02",
    "startingBalance": 52340.5,
    "endingBalance": 41500,
    "totals": { "inflow": 60000, "outflow": 70840.5 },
    "lowest": { "date": "2026-11-28", "balance": 18200 },
    "firstNegativeDate": null,
    "points": [
      {
        "date": "2026-11-03",
        "balance": 52340.5,
        "inflow": 0,
        "outflow": 0,
        "events": [
          { "label": "Meralco", "amount": -2400, "source": "RECURRING", "projected": false, "overdue": true }
        ]
      }
    ]
  }
}
```

## Frontend

### Files

| File | Change |
|---|---|
| `features/transactions/api/transaction/index.ts` | Add `getCashFlowProjection` query. `providesTags: ["Stats", "Schedules"]`, so existing mutations that invalidate those refresh it. |
| `features/dashboard/components/widgets/CashFlowProjectionWidget.tsx` | **New.** Card, header, summary, chart, states. |
| `shared/components/charts/BalanceProjectionChart.tsx` | **New.** Recharts `AreaChart` inside the existing shadcn `ui/chart.tsx` `ChartContainer` (first line/area chart in the app). |
| `features/dashboard/pages/Dashboard.tsx` | Add the widget as a full-width row between the stat cards and the Budget/Savings/History row. |
| `shared/types` | `CashFlowProjection`, `ProjectionPoint`, `ProjectionEvent`. |

### Widget layout

```
┌ CASH FLOW PROJECTION ─────────────────── [30d|60d|90d] (eye) ┐
│ Today ₱52,340   Lowest ₱18,200 · Nov 28   In 30 days ₱41,500 │
│                                                               │
│  (step area chart of balance; zero line; lowest-point dot)   │
│                                                               │
│ ● confirmed   ○ estimate                                     │
└───────────────────────────────────────────────────────────────┘
```

- **Header:** title, range toggle (existing `ui/tabs.tsx`), eye toggle sharing the existing `showBalance:<title>` pattern.
- **Summary:** Today, Lowest (with date), End of range. If
  `firstNegativeDate` is set, a warning pill: "Goes negative on Dec 14".
- **Chart:** `type="stepAfter"` (balance changes on event days, not
  gradually), faint grid, `ReferenceLine y={0}`, dot on the lowest point.
  Event days get a marker: filled = confirmed, hollow = `projected`.
- **Tooltip:** date, balance, and the day's events with signed amounts;
  estimates show `~` and "(est.)", overdue items show "Overdue".
- **Range:** independent of the dashboard month picker; always starts today.
  Choice saved in `localStorage` key `cashFlowRange` (try/catch).
- Amounts use `formatPeso`; hidden mode shows dots like the other widgets.

### States

| State | Shows |
|---|---|
| Loading | Skeleton summary row + chart-height block |
| No included CASH/BANK accounts | "Add a cash or bank account to see your projection." + link to Accounts |
| Accounts but no scheduled items | Flat line at today's balance + "No scheduled income or bills in the next N days." |
| Request error | "Couldn't load your projection." + Retry button (`refetch`) |

## Edge cases

- Timezone: all day boundaries use the user's settings timezone (same as
  `getSchedules`).
- Recurring with `endDate` inside the range stops there (already handled by
  occurrence expansion).
- Cards missing `statementDate`/`dueDate` config are skipped (existing
  `CREDIT_DETAIL_READY` filter).
- Paid-off or cancelled installment plans and `PAID | CANCELLED | SKIPPED`
  loan installments are excluded.
- Credit card *purchases* on a card are not events; they reach cash only as
  statement payments.

## Testing

Backend, `node:test` (`npm test`), pure util with fixtures, no DB:

- Running balance across a range; empty days carry the balance forward.
- Lowest point and tie-break; `firstNegativeDate` set and null.
- Overdue events land on today.
- Each row of the account filter table.
- Card installments: phone 6 × ₱5,000 example produces #3–#6 on the right
  due dates and never repeats #1 or #2.
- Projected-bill fix: ₱10k open + ₱5k new spend yields ₱10k + ₱5k, not
  ₱10k + ₱15k (extract the estimate math into a pure helper to test it).

Frontend (no test runner in the repo): manual check in the running app for
each state above, both themes, phone width, and the 30/60/90 toggle.

## Phase 2 hook

`buildProjection` takes a list of events, so the realistic forecast adds an
`ESTIMATED_SPENDING` event source (daily average of non-scheduled expenses)
and the response gains a second series. No change to the phase 1 contract.
