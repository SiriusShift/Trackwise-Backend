import assert from "node:assert/strict";
import { test } from "node:test";

import moment from "moment-timezone";

import {
  nextStatementClose,
  projectedBillEstimate,
} from "../utils/creditCycle.js";

test("unpaid open statement is not billed again", () => {
  // ₱10k still owed on the open statement + ₱5k new spending = ₱15k balance.
  assert.equal(
    projectedBillEstimate({ balance: 15000, unbilled: 0, openUnpaid: 10000 }),
    5000,
  );
});

test("paid open statement leaves the full new spending", () => {
  assert.equal(
    projectedBillEstimate({ balance: 5000, unbilled: 0, openUnpaid: 0 }),
    5000,
  );
});

test("future installment principal stays out of the next bill", () => {
  // Phone 6 × ₱5k: ₱20k of principal is billed in later cycles.
  assert.equal(
    projectedBillEstimate({ balance: 35000, unbilled: 20000, openUnpaid: 10000 }),
    5000,
  );
});

test("never goes below zero", () => {
  assert.equal(
    projectedBillEstimate({ balance: 8000, unbilled: 0, openUnpaid: 10000 }),
    0,
  );
});

test("missing balance counts as zero", () => {
  assert.equal(projectedBillEstimate({ balance: null }), 0);
});

test("next close is the statement day of the following month", () => {
  const lastClose = moment.utc("2026-10-15");
  assert.equal(
    nextStatementClose(lastClose, 15).format("YYYY-MM-DD"),
    "2026-11-15",
  );
  assert.equal(lastClose.format("YYYY-MM-DD"), "2026-10-15"); // not mutated
});

test("next close is clamped to a short month", () => {
  const lastClose = moment.utc("2026-01-31");
  assert.equal(
    nextStatementClose(lastClose, 31).format("YYYY-MM-DD"),
    "2026-02-28",
  );
});
