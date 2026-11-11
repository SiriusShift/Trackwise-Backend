import moment from "moment-timezone";
import { getAssetBalance } from "./assets.service";
const getCashflowProjection = async ({ userId, range }) => {
    const tz = await getUserTimezone(userId);
    const end = moment.tz(tz).endOf(mode).toDate();
    const netWorth = getAssetBalance(userId, null, { netWorthOnly: true, asOf: end });
}