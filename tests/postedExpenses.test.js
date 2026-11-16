import assert from "node:assert/strict";
import { test } from "node:test";

import moment from "moment-timezone";

import {
  businessDaysBetween,
  postedExpenseWhere,
  postingDate,
} from "../utils/postedExpenses.js";

test("pending purchases are never on a statement", () => {
  assert.deepEqual(postedExpenseWhere(), { isPending: false });
});

test("posted purchases are dated by postedDate, else by date", () => {
  const range = { lte: new Date("2026-11-30T23:59:59Z") };
  assert.deepEqual(postedExpenseWhere(range), {
    isPending: false,
    OR: [{ postedDate: range }, { postedDate: null, date: range }],
  });
});

test("postingDate falls back to the purchase date", () => {
  const date = new Date("2026-11-28");
  const postedDate = new Date("2026-12-01");
  assert.equal(postingDate({ date, postedDate }), postedDate);
  assert.equal(postingDate({ date, postedDate: null }), date);
});

test("business days skip weekends", () => {
  const tz = "Asia/Manila";
  const friday = moment.tz("2026-11-13", tz);
  assert.equal(businessDaysBetween(friday, moment.tz("2026-11-16", tz)), 1);
  assert.equal(businessDaysBetween(friday, moment.tz("2026-11-13", tz)), 0);
  const monday = moment.tz("2026-11-09", tz);
  assert.equal(businessDaysBetween(monday, moment.tz("2026-11-16", tz)), 5);
});
