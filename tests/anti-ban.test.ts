import test from 'node:test';
import assert from 'node:assert/strict';
import { createPacing, zeroPacing, DEFAULT_PACING } from '../src/lib/anti-ban';

// Фиксированное "время" для детерминизма: понедельник 12:00.
function makeClock() {
  let now = new Date('2026-09-28T12:00:00').getTime();
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test('pacing разрешает отклик в рабочее время в пределах лимитов', () => {
  const clock = makeClock();
  const p = createPacing({ minDelayMs: 0, maxDelayMs: 0 }, clock.now);
  const d = p.decide();
  assert.equal(d.allowed, true);
});

test('pacing блокирует ночью', () => {
  const clock = makeClock();
  // 12:00 -> перематываем на 23:00
  clock.advance(11 * 60 * 60 * 1000);
  const p = createPacing({}, clock.now);
  const d = p.decide();
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'night');
  assert.ok(d.retryAfterMs > 0);
});

test('рабочие часы — московские, а не серверные', () => {
  /*
   * Регрессия сплит-брейна: окна считались в таймзоне процесса, а квоты —
   * по Москве. В контейнере с TZ=UTC окно 9–20 уезжало на 12:00–23:00 МСК.
   * Абсолютные UTC-метки: тест обязан проходить при любой TZ процесса.
   */
  // 06:00Z = 09:00 МСК — начало рабочего дня.
  const morning = createPacing({ minDelayMs: 0, maxDelayMs: 0 }, () => Date.UTC(2026, 8, 28, 6, 0, 0));
  assert.equal(morning.decide().allowed, true, '09:00 МСК обязано быть рабочим временем');
  // 05:59Z = 08:59 МСК — ещё ночь.
  const edge = createPacing({ minDelayMs: 0, maxDelayMs: 0 }, () => Date.UTC(2026, 8, 28, 5, 59, 0));
  const d = edge.decide();
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'night');
});

test('ночное окно через полночь не останавливает всё (overnight 20→2)', () => {
  /*
   * Окно 20:00–02:00 — ночная смена. Без overnight-ветки условие
   * hour < 20 || hour >= 2 истинно всегда: 03:00 (3<20), 21:00 (21>=2) —
   * ночь круглые сутки, ноль отправок без единой ошибки.
   */
  const night = { minDelayMs: 0, maxDelayMs: 0, workStartHour: 20, workEndHour: 2 } as const;
  // 18:00Z = 21:00 МСК — внутри окна, отправка разрешена.
  assert.equal(
    createPacing({ ...night }, () => Date.UTC(2026, 8, 28, 18, 0, 0)).decide().allowed,
    true,
    '21:00 МСК внутри окна 20–2',
  );
  // 22:00Z = 01:00 МСК — внутри окна, отправка разрешена.
  assert.equal(
    createPacing({ ...night }, () => Date.UTC(2026, 8, 28, 22, 0, 0)).decide().allowed,
    true,
    '01:00 МСК внутри окна 20–2',
  );
  // 16:00Z = 19:00 МСК — ночь, пауза ровно до 20:00 МСК (1 час).
  const evening = createPacing({ ...night }, () => Date.UTC(2026, 8, 28, 16, 0, 0)).decide();
  assert.equal(evening.allowed, false);
  assert.equal(evening.reason, 'night');
  assert.equal(evening.retryAfterMs, 3_600_000, `пауза обязана быть 1ч, а не ${evening.retryAfterMs}`);
});

test('равные границы окна — круглосуточная работа, а не ночь', () => {
  const p = createPacing(
    { minDelayMs: 0, maxDelayMs: 0, workStartHour: 9, workEndHour: 9 },
    () => Date.UTC(2026, 8, 28, 0, 0, 0), // 03:00 МСК
  );
  assert.equal(p.decide().allowed, true, '9→9 обязано читаться как "всегда можно"');
});

test('pacing выдерживает паузу между откликами (regression)', () => {
  // Раньше decide() возвращал delayMs, но никто его не применял, и recordSent
  // не ставил cooldown — отклики уходили подряд без всякой паузы.
  const clock = makeClock();
  const p = createPacing(
    { minDelayMs: 60_000, maxDelayMs: 60_000, jitterMinutes: 0, dailyLimit: 10, hourlyLimit: 10 },
    clock.now,
  );

  const first = p.decide();
  assert.equal(first.allowed, true);
  assert.equal(first.allowed && first.delayMs, 60_000, 'delayMs должен соответствовать конфигу');
  p.recordSent();

  const second = p.decide();
  assert.equal(second.allowed, false, 'сразу после отправки пауза обязательна');
  assert.equal(second.allowed === false && second.reason, 'backoff');

  clock.advance(60_001);
  assert.equal(p.decide().allowed, true, 'после паузы отправка снова разрешена');
});

test('pacing не копит cooldown через разные decide() без отправки', () => {
  const clock = makeClock();
  const p = createPacing({ minDelayMs: 30_000, maxDelayMs: 30_000, jitterMinutes: 0 }, clock.now);
  p.decide();
  p.decide();
  p.decide();
  p.recordSent();
  // Cooldown считается от последней отправки, а не суммируется по decide().
  assert.equal(p.decide().allowed, false);
  clock.advance(30_001);
  assert.equal(p.decide().allowed, true);
});

test('pacing.configure меняет лимиты на ходу', () => {
  const clock = makeClock();
  const p = createPacing(
    { dailyLimit: 1, hourlyLimit: 10, minDelayMs: 0, maxDelayMs: 0, jitterMinutes: 0 },
    clock.now,
  );
  p.decide();
  p.recordSent();
  assert.equal(p.decide().allowed, false, 'при dailyLimit=1 дальше нельзя');

  p.configure({ dailyLimit: 5 });
  assert.equal(p.decide().allowed, true, 'после configure лимит должен вырасти');
});

test('pacing соблюдает суточный лимит', () => {
  const clock = makeClock();
  const p = createPacing(
    { dailyLimit: 2, minDelayMs: 0, maxDelayMs: 0, jitterMinutes: 0 },
    clock.now,
  );
  assert.equal(p.decide().allowed, true);
  p.recordSent();
  assert.equal(p.decide().allowed, true);
  p.recordSent();
  const d = p.decide();
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'daily');
});

test('pacing соблюдает часовой лимит', () => {
  const clock = makeClock();
  const p = createPacing(
    { hourlyLimit: 3, dailyLimit: 100, minDelayMs: 0, maxDelayMs: 0, jitterMinutes: 0 },
    clock.now,
  );
  for (let i = 0; i < 3; i++) {
    assert.equal(p.decide().allowed, true);
    p.recordSent();
  }
  const d = p.decide();
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'hourly');
});

test('pacing включает backoff после ошибок платформы', () => {
  const clock = makeClock();
  const p = createPacing({ minDelayMs: 0, maxDelayMs: 0 }, clock.now);
  p.recordFailure('rate_limit');
  const d = p.decide();
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'backoff');
});

test('zeroPacing всегда разрешает без задержки', () => {
  const z = zeroPacing();
  assert.deepEqual(z.decide(), { allowed: true, delayMs: 0 });
});

test('дефолтный конфиг имеет рабочие лимиты', () => {
  assert.ok(DEFAULT_PACING.dailyLimit > 0);
  assert.ok(DEFAULT_PACING.hourlyLimit > 0);
  assert.ok(DEFAULT_PACING.workStartHour < DEFAULT_PACING.workEndHour);
});
