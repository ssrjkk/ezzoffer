import test from "node:test";
import assert from "node:assert/strict";
import { rateLimit } from "../src/lib/rate-limit";

function makeClock() {
  let now = 0;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("rateLimit разрешает запросы в пределах лимита", () => {
  const clock = makeClock();
  const state = { buckets: new Map(), now: clock.now };

  for (let i = 0; i < 3; i++) {
    assert.equal(
      rateLimit("k", { windowMs: 1000, max: 3 }, state).allowed,
      true,
      `попытка ${i + 1}`,
    );
  }
  const blocked = rateLimit("k", { windowMs: 1000, max: 3 }, state);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
});

test("rateLimit освобождает ключ после окна", () => {
  const clock = makeClock();
  const state = { buckets: new Map(), now: clock.now };

  for (let i = 0; i < 2; i++) {
    rateLimit("k", { windowMs: 1000, max: 2 }, state);
  }
  assert.equal(rateLimit("k", { windowMs: 1000, max: 2 }, state).allowed, false);
  clock.advance(1001);
  assert.equal(rateLimit("k", { windowMs: 1000, max: 2 }, state).allowed, true);
});

test("разные ключи не блокируют друг друга", () => {
  const clock = makeClock();
  const state = { buckets: new Map(), now: clock.now };

  for (let i = 0; i < 2; i++) {
    rateLimit("a", { windowMs: 1000, max: 1 }, state);
  }
  assert.equal(
    rateLimit("b", { windowMs: 1000, max: 1 }, state).allowed,
    true,
  );
});

test("модульный дефолт держит состояние между вызовами (regression: default state)", () => {
  // Раньше дефолтный state создавался в параметре на каждый вызов — лимитер не работал.
  assert.equal(rateLimit("shared", { windowMs: 60000, max: 2 }).allowed, true);
  assert.equal(rateLimit("shared", { windowMs: 60000, max: 2 }).allowed, true);
  const blocked = rateLimit("shared", { windowMs: 60000, max: 2 });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
});