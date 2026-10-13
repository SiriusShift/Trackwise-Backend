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

// Postgres date_trunc('week') starts on Monday, so "week" maps to moment's isoWeek.
const toUnit = (mode) => (mode === "week" ? "isoWeek" : mode);

// Period bounds in the user's timezone: the requested range snapped to whole
// periods, plus the start of the period before it (for trend comparison).
export const getPeriodRange = (startDate, endDate, mode, timezone) => {
  const unit = toUnit(mode);
  return {
    start: moment.tz(startDate, timezone).startOf(unit).toDate(),
    end: moment.tz(endDate, timezone).endOf(unit).toDate(),
    prevStart: moment.tz(startDate, timezone).subtract(1, mode).startOf(unit).toDate(),
  };
};
