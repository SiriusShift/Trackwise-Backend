import assert from "node:assert/strict";
import { test } from "node:test";
import moment from "moment-timezone";

import {
  firstOccurrenceOnOrAfter,
  nextOccurrenceAfter,
} from "../utils/recurringSchedule.js";

const tz = "Asia/Manila";
const local = (date) => moment.tz(date, tz);
const days = (daysOfMonth) => ({
  startDate: local("2026-01-01").toDate(),
  interval: 1,
  unit: "month",
  daysOfMonth,
});
const next = (item, date) =>
  nextOccurrenceAfter(item, local(date), tz).format("YYYY-MM-DD");
const first = (item, date) =>
  firstOccurrenceOnOrAfter(item, local(date), tz).format("YYYY-MM-DD");

test("salary days roll through the year", () => {
  const item = days([10, 25]);
  assert.equal(next(item, "2026-11-10"), "2026-11-25");
  assert.equal(next(item, "2026-11-25"), "2026-12-10");
  assert.equal(next(item, "2026-12-25"), "2027-01-10");
});

test("the 31st clamps and returns", () => {
  const item = days([31]);
  assert.equal(next(item, "2026-10-31"), "2026-11-30");
  assert.equal(next(item, "2026-11-30"), "2026-12-31");
  assert.equal(next(item, "2027-01-31"), "2027-02-28");
  assert.equal(next(item, "2028-01-31"), "2028-02-29");
  assert.equal(next(item, "2027-02-28"), "2027-03-31");
});

test("days clamping to one date count once", () => {
  const item = days([28, 31]);
  assert.equal(next(item, "2027-01-31"), "2027-02-28");
  assert.equal(next(item, "2027-02-28"), "2027-03-28");
});

test("first occurrence honours the start date", () => {
  const item = days([10, 25]);
  assert.equal(first(item, "2026-11-10"), "2026-11-10");
  assert.equal(first(item, "2026-11-11"), "2026-11-25");
  assert.equal(first(item, "2026-11-26"), "2026-12-10");
});

test("local date is used, not UTC", () => {
  // 16:00 UTC on Nov 9 is already Nov 10 in Manila.
  const result = firstOccurrenceOnOrAfter(
    days([10]),
    new Date("2026-11-09T16:00:00Z"),
    tz,
  );
  assert.equal(result.format("YYYY-MM-DD"), "2026-11-10");
  assert.equal(result.toISOString(), "2026-11-09T16:00:00.000Z");
});

test("catch-up steps from the given date, not today", () => {
  assert.equal(next(days([10, 25]), "2026-01-10"), "2026-01-25");
});

test("interval schedules match the anchored rule", () => {
  const monthly = {
    startDate: local("2026-01-31").toDate(),
    interval: 1,
    unit: "month",
    daysOfMonth: [],
  };
  assert.equal(next(monthly, "2026-01-31"), "2026-02-28");
  assert.equal(next(monthly, "2026-02-28"), "2026-03-31");

  const biweekly = {
    startDate: local("2026-11-10").toDate(),
    interval: 2,
    unit: "week",
  };
  assert.equal(next(biweekly, "2026-11-10"), "2026-11-24");
  assert.equal(next(biweekly, "2026-11-24"), "2026-12-08");
  assert.equal(first(biweekly, "2026-11-10"), "2026-11-10");
  assert.equal(first(biweekly, "2026-11-11"), "2026-11-24");
});
