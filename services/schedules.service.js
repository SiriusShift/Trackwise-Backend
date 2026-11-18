import moment from "moment-timezone";

import {
  getCreditItems,
  syncCreditStatements,
} from "./schedules/creditStatements.service.js";
import { getRecurringItems } from "./schedules/recurringSchedules.service.js";
import { getTimezone, inRange } from "./schedules/shared.js";

export {
  getCreditStatementSchedule,
  getProjectedCreditStatement,
  payCreditStatement,
  syncCreditStatements
} from "./schedules/creditStatements.service.js";
export {
  buildBilledInstallmentRefund,
  cancelInstallmentPlan
} from "./schedules/installmentPlans.service.js";
export {
  getRecurringSchedule,
  getRecurringScheduleHistory,
  payRecurringSchedule,
  skipRecurringSchedule
} from "./schedules/recurringSchedules.service.js";
export { resolveTransferCategory } from "./schedules/shared.js";

/*
|--------------------------------------------------------------------------
| Scheduled Transactions
|--------------------------------------------------------------------------
| One feed for everything that is due on a date, regardless of where it comes
| from. Every item has the same shape so the calendar / dashboard don't need
| to know the source. Each source lives in services/schedules/:
|
|   RECURRING         -> recurringSchedules.service.js
|   CREDIT_STATEMENT  -> creditStatements.service.js
|                        (installmentPlans.service.js cancels card plans)
|
| Adding loans later = another source file that maps LoanInstallment to this
| shape, merged in getSchedules below.
*/

const priorityRank = (item, today) => {
  if (item.needsAttention) return 0; // failed auto-log
  if (moment(item.dueDate).isBefore(today, "day")) return 1; // overdue
  return 2; // due today / upcoming
};

/*
|--------------------------------------------------------------------------
| List
|--------------------------------------------------------------------------
| Query:
|   dateFrom / dateTo  ISO dates. Without dateFrom, overdue items are included.
|   type               Expense | Income | Transfer
|   source             RECURRING | CREDIT_STATEMENT
|   actionable         "true" -> only items that need the user (pay/skip)
*/
export const getSchedules = async (userId, query = {}) => {
  const timezone = await getTimezone(userId);
  const today = moment().tz(timezone).startOf("day");

  const from = query.dateFrom ? moment(query.dateFrom) : null;
  const to = query.dateTo ? moment(query.dateTo) : null;
  const { type, source } = query;
  const actionableOnly =
    query.actionable === "true" || query.actionable === true;

  const wantsRecurring = !source || source === "RECURRING";
  const wantsCredit =
    (!source || source === "CREDIT_STATEMENT") &&
    (!type || type === "Transfer");

  if (wantsCredit) await syncCreditStatements(userId, timezone);

  const [recurring, credit] = await Promise.all([
    wantsRecurring
      ? getRecurringItems(userId, timezone, { from, to, type })
      : [],
    wantsCredit ? getCreditItems(userId, timezone, from, to) : [],
  ]);

  return [
    ...recurring,
    ...credit.filter(
      (item) => item.projected || inRange(item.dueDate, from, to),
    ),
  ]
    .filter((item) => !actionableOnly || item.actionable)
    .sort((a, b) => {
      const rankDiff = priorityRank(a, today) - priorityRank(b, today);
      if (rankDiff !== 0) return rankDiff;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
};
