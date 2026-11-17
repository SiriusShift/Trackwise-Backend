import moment from "moment-timezone";
import { prisma } from "../config/prisma.js";

/*
|--------------------------------------------------------------------------
| User timezone helpers
|--------------------------------------------------------------------------
| Dates are stored in the database as UTC. Anything that groups or labels
| them by day/week/month/year must do so in the user's own timezone
| (settings.timezone), not the server's.
*/

// Falls back to UTC when the user has no setting or the saved name is not a valid IANA zone.
export const getUserTimezone = async (userId) => {
  const settings = await prisma.settings.findFirst({
    where: { userId: Number(userId) },
    select: { timezone: true },
  });
  const tz = settings?.timezone;
  return tz && moment.tz.zone(tz) ? tz : "UTC";
};

// The user's first day of the week (0 = Sunday … 6 = Saturday). Defaults to Sunday.
export const getUserWeekStartDay = async (userId) => {
  const settings = await prisma.settings.findFirst({
    where: { userId: Number(userId) },
    select: { weekStartDay: true },
  });
  const day = settings?.weekStartDay;
  return Number.isInteger(day) && day >= 0 && day <= 6 ? day : 0;
};

// Postgres date_trunc('week') always starts on Monday. Shifting the date forward
// by this many days before truncating (and back after) moves the boundary to
// the user's week start day. 0 for every other mode.
export const getWeekShiftDays = (mode, weekStartDay = 1) =>
  mode === "week" ? (8 - weekStartDay) % 7 : 0;

const startOfPeriod = (date, mode, weekStartDay) => {
  if (mode !== "week") return date.clone().startOf(mode);
  const day = date.clone().startOf("day");
  return day.subtract((day.day() - weekStartDay + 7) % 7, "days");
};

const endOfPeriod = (date, mode, weekStartDay) => {
  if (mode !== "week") return date.clone().endOf(mode);
  return startOfPeriod(date, mode, weekStartDay).add(6, "days").endOf("day");
};

// Period bounds in the user's timezone: the requested range snapped to whole
// periods, plus the period before it (for trend comparison).
export const getPeriodRange = (
  startDate,
  endDate,
  mode,
  timezone,
  weekStartDay = 1,
) => {
  const start = moment.tz(startDate, timezone);
  const end = moment.tz(endDate, timezone);
  return {
    start: startOfPeriod(start, mode, weekStartDay).toDate(),
    end: endOfPeriod(end, mode, weekStartDay).toDate(),
    prevStart: startOfPeriod(
      start.clone().subtract(1, mode),
      mode,
      weekStartDay,
    ).toDate(),
    prevEnd: endOfPeriod(end.clone().subtract(1, mode), mode, weekStartDay).toDate(),
  };
};
