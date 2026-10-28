import test, { before } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Человеческий профиль отправок: длинные перерывы, смягчение выходных,
 * прогрев нового отправителя.
 *
 * Ровный машинный поток — главная примета автооткликов: случайные 45с–3мин
 * без единого перерыва, полные лимиты в первый же день, одинаковые объёмы
 * в выходные. Три механизма ломают каждый пункт. Все включаются через env
 * (дефолт — выключено: политика объёма принадлежит деплою, а не коду).
 */

let antiBan: typeof import('../src/lib/anti-ban');
let config: typeof import('../src/lib/config');
let stealth: typeof import('../src/lib/autoapply');

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  antiBan = await import('../src/lib/anti-ban');
  config = await import('../src/lib/config');
  stealth = await import('../src/lib/autoapply');
});

// 2026-10-24 — суббота, 25 — воскресенье, 26 — понедельник (полдень МСК).
const SAT = Date.UTC(2026, 9, 24, 9, 0, 0);
const SUN = Date.UTC(2026, 9, 25, 9, 0, 0);
const MON = Date.UTC(2026, 9, 26, 9, 0, 0);

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('mskWeekday считает день недели по Москве, а не по серверу', () => {
  assert.equal(stealth.mskWeekday(SAT), 6, 'суббота');
  assert.equal(stealth.mskWeekday(SUN), 0, 'воскресенье');
  assert.equal(stealth.mskWeekday(MON), 1, 'понедельник');
  // Граница суток: суббота 00:30 МСК — это ещё пятница по UTC.
  assert.equal(stealth.mskWeekday(Date.UTC(2026, 9, 23, 21, 30, 0)), 6, 'полночь МСК');
});

test('weekendScaledCap: будни не трогает, выходные режет', () => {
  withEnv({ AUTOAPPLY_WEEKEND_FACTOR: '0.5' }, () => {
    assert.equal(stealth.weekendScaledCap(50, MON), 50, 'будни урезаны');
    assert.equal(stealth.weekendScaledCap(50, SAT), 25, 'суббота не урезана');
    assert.equal(stealth.weekendScaledCap(50, SUN), 25, 'воскресенье не урезано');
  });
});

test('weekendScaledCap: выключен по умолчанию, ноль даёт дежурный минимум', () => {
  withEnv({ AUTOAPPLY_WEEKEND_FACTOR: undefined }, () => {
    assert.equal(stealth.weekendScaledCap(50, SAT), 50, 'дефолт должен быть выключен');
  });
  withEnv({ AUTOAPPLY_WEEKEND_FACTOR: '1' }, () => {
    assert.equal(stealth.weekendScaledCap(50, SAT), 50, 'factor=1 должен быть выключен');
  });
  withEnv({ AUTOAPPLY_WEEKEND_FACTOR: '0' }, () => {
    assert.equal(stealth.weekendScaledCap(50, SAT), 1, 'ноль глушит всё вместо дежурного минимума');
  });
  withEnv({ AUTOAPPLY_WEEKEND_FACTOR: 'мусор' }, () => {
    assert.equal(stealth.weekendScaledCap(50, SAT), 50, 'мусор должен выключать');
  });
});

test('warmupScaledCap: линейный рост от первой отправки', () => {
  const first = SAT;
  withEnv({}, () => {
    // days = 0 — выключено при любом возрасте.
    assert.equal(stealth.warmupScaledCap(50, null, 0, SAT), 50);
    assert.equal(stealth.warmupScaledCap(50, first, 0, SAT), 50);
    // Нет истории — самый строгий режим: 1/7 объёма.
    assert.equal(stealth.warmupScaledCap(50, null, 7, SAT), 7);
    // День первой отправки: (0+1)/7.
    assert.equal(stealth.warmupScaledCap(50, first, 7, first), 7);
    // Третий день: (3+1)/7 → 28.
    assert.equal(stealth.warmupScaledCap(50, first, 7, first + 3 * 86_400_000), 28);
    // Шестой день — полный объём, дальше не растёт.
    assert.equal(stealth.warmupScaledCap(50, first, 7, first + 6 * 86_400_000), 50);
    assert.equal(stealth.warmupScaledCap(50, first, 7, first + 30 * 86_400_000), 50);
  });
});

test('warmupDays: парсинг и границы', () => {
  withEnv({ AUTOAPPLY_WARMUP_DAYS: undefined }, () => assert.equal(config.warmupDays(), 0));
  withEnv({ AUTOAPPLY_WARMUP_DAYS: '7' }, () => assert.equal(config.warmupDays(), 7));
  withEnv({ AUTOAPPLY_WARMUP_DAYS: 'abc' }, () => assert.equal(config.warmupDays(), 0));
  withEnv({ AUTOAPPLY_WARMUP_DAYS: '-3' }, () => assert.equal(config.warmupDays(), 0));
  withEnv({ AUTOAPPLY_WARMUP_DAYS: '365' }, () => assert.equal(config.warmupDays(), 30));
});

test('longBreakChance: парсинг и границы', () => {
  withEnv({ AUTOAPPLY_LONG_BREAK_CHANCE: undefined }, () => assert.equal(config.longBreakChance(), 0));
  withEnv({ AUTOAPPLY_LONG_BREAK_CHANCE: '0.12' }, () =>
    assert.equal(config.longBreakChance(), 0.12),
  );
  withEnv({ AUTOAPPLY_LONG_BREAK_CHANCE: '2' }, () => assert.equal(config.longBreakChance(), 1));
  withEnv({ AUTOAPPLY_LONG_BREAK_CHANCE: '-1' }, () => assert.equal(config.longBreakChance(), 0));
  withEnv({ AUTOAPPLY_LONG_BREAK_CHANCE: 'abc' }, () => assert.equal(config.longBreakChance(), 0));
});

test('длинный перерыв: chance=1 всегда берёт длинную паузу', () => {
  const p = antiBan.createPacing({
    minDelayMs: 1000,
    maxDelayMs: 1000,
    jitterMinutes: 0,
    longBreakChance: 1,
    longBreakMinMs: 900_000,
    longBreakMaxMs: 900_000,
  });
  for (let i = 0; i < 5; i++) {
    // 12:00–14:00 МСК: внутри рабочего окна при дефолтных 9–20.
    const d = p.decide(9 * 3_600_000 + i * 1_800_000);
    assert.ok(d.allowed, 'прогрев не должен блокировать');
    if (d.allowed) assert.equal(d.delayMs, 900_000, 'взята не длинная пауза');
  }
});

test('длинный перерыв: перепутанные границы схлопываются', () => {
  const p = antiBan.createPacing({
    minDelayMs: 1000,
    maxDelayMs: 1000,
    jitterMinutes: 0,
    longBreakChance: 1,
    longBreakMinMs: 2_700_000,
    longBreakMaxMs: 900_000,
  });
  const d = p.decide(9 * 3_600_000);
  assert.ok(d.allowed);
  if (d.allowed) {
    assert.ok(d.delayMs >= 900_000 && d.delayMs <= 2_700_000, `пауза вне границ: ${d.delayMs}`);
  }
});

test('длинный перерыв: chance=0 оставляет прежнее поведение', () => {
  const p = antiBan.createPacing({
    minDelayMs: 60_000,
    maxDelayMs: 60_000,
    jitterMinutes: 0,
    longBreakChance: 0,
    longBreakMinMs: 900_000,
    longBreakMaxMs: 900_000,
  });
  const d = p.decide(9 * 3_600_000);
  assert.ok(d.allowed);
  if (d.allowed) assert.equal(d.delayMs, 60_000, 'обычная пауза изменилась');
});
