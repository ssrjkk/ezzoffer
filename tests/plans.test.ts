import test from "node:test";
import assert from "node:assert/strict";
import { planDailyLimit, isPlanActive, daysLeft } from "../src/lib/plans";

test("planDailyLimit по тарифам", () => {
  assert.equal(planDailyLimit("trial"), 50);
  assert.equal(planDailyLimit("start"), 50);
  assert.equal(planDailyLimit("pro"), 100);
  assert.equal(planDailyLimit("expert"), 250);
  assert.equal(planDailyLimit("none"), 0);
  assert.equal(planDailyLimit("weird"), 0);
});

test("isPlanActive учитывает срок действия", () => {
  assert.equal(isPlanActive({ plan: "pro", plan_expires_at: Date.now() + 1000 }), true);
  assert.equal(isPlanActive({ plan: "pro", plan_expires_at: Date.now() - 1000 }), false);
  assert.equal(isPlanActive({ plan: "pro", plan_expires_at: null }), false);
  assert.equal(isPlanActive(undefined), false);
});

test("daysLeft неотрицателен", () => {
  assert.equal(daysLeft({ plan_expires_at: Date.now() + 48 * 60 * 60 * 1000 }), 2);
  assert.equal(daysLeft({ plan_expires_at: Date.now() - 1000 }), 0);
  assert.equal(daysLeft(undefined), 0);
});