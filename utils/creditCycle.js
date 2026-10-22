import moment from "moment-timezone";

// Day-of-month clamped to the month length (31 -> Feb 28/29).
export const dayInMonth = (monthMoment, day) =>
  monthMoment.clone().date(Math.min(day, monthMoment.daysInMonth())).startOf("day");

// Saturday moves back to Friday, Sunday forward to Monday.
const nearestWeekday = (date) => {
  const weekday = date.isoWeekday();
  if (weekday === 6) return date.clone().subtract(1, "day");
  if (weekday === 7) return date.clone().add(1, "day");
  return date;
};

// A card needs a statement day and one way to find its due date.
export const hasDueRule = (creditDetail) =>
  !!creditDetail?.statementDate &&
  !!(creditDetail.dueDaysAfterStatement || creditDetail.dueDate);

// Due date for a cycle closing on `closeDate`. Banks that bill a fixed number
// of days after the statement use dueDaysAfterStatement (moved off weekends);
// otherwise it is a day of the month: the same month when the due day comes
// after the statement day, else the following month.
export const creditDueDate = (closeDate, creditDetail) => {
  const { dueDaysAfterStatement, dueDate: dueDay, statementDate: statementDay } = creditDetail;

  if (dueDaysAfterStatement) {
    return nearestWeekday(closeDate.clone().add(dueDaysAfterStatement, "days").startOf("day"));
  }

  const month = dueDay > statementDay ? closeDate.clone() : closeDate.clone().add(1, "month");
  return dayInMonth(month.startOf("month"), dueDay);
};

// Most recent statement close on or before `today`.
export const lastStatementClose = (today, statementDay) => {
  const thisMonth = dayInMonth(today.clone().startOf("month"), statementDay);
  return thisMonth.isAfter(today)
    ? dayInMonth(today.clone().subtract(1, "month").startOf("month"), statementDay)
    : thisMonth;
};

/**
 * How many of a plan's installments have been billed by the statement closing
 * on `closeDate`. Statements close on the same day each month, so comparing
 * calendar months against the plan's first close (`startDate`) is enough.
 * 0 before the first bill (deferred promos), capped at `termMonths`.
 */
export const billedInstallmentCount = (startDate, closeDate, termMonths, timezone) => {
  const first = moment.tz(startDate, timezone).startOf("month");
  const close = moment.tz(closeDate, timezone).startOf("month");
  if (close.isBefore(first)) return 0;
  return Math.min(close.diff(first, "months") + 1, termMonths);
};

/**
 * Lays out the installments of a card purchase on the card's statement cycles.
 *
 * A purchase on or before the cut-off day is billed on that month's statement
 * (it shows up right away); one made after it waits for the next. `skip`
 * defers the first bill by that many more statements, for promos like
 * "pay after 3 months". Installment k then lands on the statement k months
 * after the first, due on that statement's due date.
 *
 * `startDate` is the close date of the first statement; each row's `dueDate`
 * is its statement's due date.
 */
export const buildInstallmentSchedule = ({
  purchaseDate,
  timezone,
  creditDetail,
  termMonths,
  monthlyAmount,
  skip = 0,
}) => {
  const purchase = moment.tz(purchaseDate, timezone).startOf("day");

  const statementDay = creditDetail.statementDate;
  const thisCut = dayInMonth(purchase.clone().startOf("month"), statementDay);
  const firstMonth = purchase.isAfter(thisCut, "day")
    ? purchase.clone().startOf("month").add(1, "month")
    : purchase.clone().startOf("month");

  const closeFor = (offset) =>
    dayInMonth(firstMonth.clone().add(skip + offset, "month"), statementDay);

  const installments = Array.from({ length: termMonths }, (_, i) => ({
    installmentNo: i + 1,
    dueDate: creditDueDate(closeFor(i), creditDetail).toDate(),
    amount: monthlyAmount,
  }));

  return { startDate: closeFor(0).toDate(), installments };
};
