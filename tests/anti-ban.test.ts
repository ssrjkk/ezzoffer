import test from "node:test";
import assert from "node:assert/strict";
import { createPacing, zeroPacing, DEFAULT_PACING } from "../src/lib/anti-ban";

// Фиксированное "время" для детерминизма: понедельник 12:00.
function makeClock() {
  let now = new Date("2026-09-28T12:00:00").getTime();
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("pacing разрешает отклик в рабочее время в пределах лимитов", () => {
  const clock = makeClock();
  const p = createPacing({ minDelayMs: 0, maxDelayMs: 0 }, clock.now);
  const d = p.decide();
  assert.equal(d.allowed, true);
});

test("pacing блокирует ночью", () => {
  const clock = makeClock();
  // 12:00 -> перематываем на 23:00
  clock.advance(11 * 60 * 60 * 1000);
  const p = createPacing({}, clock.now);
  const d = p.decide();
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "night");
  assert.ok(d.retryAfterMs > 0);
});

test("pacing соблюдает суточный лимит", () => {
  const clock = makeClock();
  const p = createPacing({ dailyLimit: 2, minDelayMs: 0, maxDelayMs: 0 }, clock.now);
  assert.equal(p.decide().allowed, true);
  p.recordSent();
  assert.equal(p.decide().allowed, true);
  p.recordSent();
  const d = p.decide();
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "daily");
});

test("pacing соблюдает часовой лимит", () => {
  const clock = makeClock();
  const p = createPacing({ hourlyLimit: 3, dailyLimit: 100, minDelayMs: 0, maxDelayMs: 0 }, clock.now);
  for (let i = 0; i < 3; i++) {
    assert.equal(p.decide().allowed, true);
    p.recordSent();
  }
  const d = p.decide();
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "hourly");
});

test("pacing включает backoff после ошибок платформы", () => {
  const clock = makeClock();
  const p = createPacing({ minDelayMs: 0, maxDelayMs: 0 }, clock.now);
  p.recordFailure("platform");
  const d = p.decide();
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "backoff");
});

test("zeroPacing всегда разрешает без задержки", () => {
  const z = zeroPacing();
  assert.deepEqual(z.decide(), { allowed: true, delayMs: 0 });
});

test("дефолтный конфиг имеет рабочие лимиты", () => {
  assert.ok(DEFAULT_PACING.dailyLimit > 0);
  assert.ok(DEFAULT_PACING.hourlyLimit > 0);
  assert.ok(DEFAULT_PACING.workStartHour < DEFAULT_PACING.workEndHour);
});