import moment from "moment-timezone"; // NOTE: must be moment-timezone — plain "moment" has no .tz()

const hasDays = (item) => item.daysOfMonth?.length > 0;

// A day the month doesn't have falls on its last day (31st -> Nov 30), without
// affecting later months because the chosen day itself is never overwritten.
const clampedDate = (monthStart, day) =>
  monthStart.clone().date(Math.min(day, monthStart.daysInMonth()));

const nextDayOfMonthAfter = (item, after) => {
  const thisMonth = after.clone().startOf("month");
  const nextMonth = thisMonth.clone().add(1, "month");

  // Every chosen day occurs in next month, so one of these always qualifies.
  for (const monthStart of [thisMonth, nextMonth]) {
    const candidates = item.daysOfMonth
      .map((day) => clampedDate(monthStart, day))
      .filter((date) => date.isAfter(after))
      .sort((a, b) => a.valueOf() - b.valueOf());
    if (candidates.length) return candidates[0];
  }
};

// NOTE: Next due date is computed from startDate + k * interval instead of
// "previous due + interval". Chaining month additions drifts at month end
// (Jan 31 -> Feb 28 -> Mar 28). Anchoring on startDate gives Jan 31 -> Feb 28 -> Mar 31.
const nextIntervalAfter = (item, after, timezone) => {
  const anchor = moment.tz(item.startDate, timezone).startOf("day");
  let k = 0;
  let next = anchor.clone();
  while (!next.isAfter(after)) {
    k++;
    next = anchor.clone().add(k * item.interval, item.unit);
  }
  return next;
};

// The first due date after `date`, as a moment at local start of day.
export const nextOccurrenceAfter = (item, date, timezone) => {
  const after = moment(date).tz(timezone).startOf("day");
  return hasDays(item)
    ? nextDayOfMonthAfter(item, after)
    : nextIntervalAfter(item, after, timezone);
};

// The first due date on or after `date`, as a moment at local start of day.
export const firstOccurrenceOnOrAfter = (item, date, timezone) =>
  nextOccurrenceAfter(
    item,
    moment(date).tz(timezone).startOf("day").subtract(1, "day"),
    timezone,
  );
