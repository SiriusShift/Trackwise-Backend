// Card statements follow the bank, which bills a purchase when it posts, not
// when it was made. A posted expense lands on the cycle of its postedDate, or
// of its `date` when postedDate is empty (posted the same day, or recorded
// before pending tracking existed). Pending expenses are on no statement yet.

// Prisma `where` for posted expenses, optionally limited to a posting-date
// range such as `{ lte: closeDate }` or `{ gt: lastClose }`.
export const postedExpenseWhere = (range) => ({
  isPending: false,
  ...(range && {
    OR: [{ postedDate: range }, { postedDate: null, date: range }],
  }),
});

// The date an expense counts on a statement.
export const postingDate = (expense) => expense.postedDate ?? expense.date;

// Weekdays after `from` up to and including `to` (moments). Banks post on
// business days, so a purchase made Friday is 1 business day old on Monday.
export const businessDaysBetween = (from, to) => {
  let days = 0;
  const day = from.clone().startOf("day");
  while (day.isBefore(to, "day")) {
    day.add(1, "day");
    if (day.isoWeekday() <= 5) days += 1;
  }
  return days;
};
