import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Паузер переживает рестарт.
 *
 * Без снимка перезапуск/деплой сразу после 429/503 сбрасывал backoff —
 * и первый же тик слал burst в площадку. Снимок пишется на каждое живое
 * событие (recordSent/recordFailure/respectRetryAfter без явного времени),
 * гидратация прошлого (recordSent с меткой) снимок не трогает.
 */

type Database = ReturnType<typeof import('../src/lib/db').createDatabase>;

let db: Database;
let antiBan: typeof import('../src/lib/anti-ban');
let pacingFor: typeof import('../src/lib/autoapply').pacingFor;
let resetPacing: typeof import('../src/lib/autoapply').resetPacing;

const NOW = 1_700_000_000_000;

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  db = (await import('../src/lib/db')).db;
  antiBan = await import('../src/lib/anti-ban');
  ({ pacingFor, resetPacing } = await import('../src/lib/autoapply'));
});

beforeEach(() => {
  db.exec('DELETE FROM meta; DELETE FROM users; DELETE FROM send_slots;');
  resetPacing();
});

function seedUser(id: number): void {
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, 'u@example.com', 'h', ?)",
  ).run(id, NOW);
}

test('снимок/восстановление переносят backoff', () => {
  const cfg = { minDelayMs: 1000, maxDelayMs: 1000, jitterMinutes: 0, workStartHour: 0, workEndHour: 24 };
  const a = antiBan.createPacing(cfg);
  a.recordFailure('rate_limit', NOW);
  const snap = a.snapshot();
  assert.ok(snap.failAt === NOW, 'снимок не забрал время отказа');

  const b = antiBan.createPacing(cfg);
  b.restore(snap);
  const d = b.decide(NOW + 1000);
  assert.equal(d.allowed, false, 'восстановленный паузер разрешил отправку');
  assert.equal(d.reason, 'backoff', 'восстановлен не тот отказ');
  assert.ok(
    d.retryAfterMs > 14 * 60_000,
    `пауза не совпала с backoff rate_limit: ${d.retryAfterMs}`,
  );
});

test('битый снимок — как его отсутствие', () => {
  const b = antiBan.createPacing({
    minDelayMs: 0,
    maxDelayMs: 0,
    jitterMinutes: 0,
    workStartHour: 0,
    workEndHour: 24,
  });
  b.restore({} as never);
  const d = b.decide(NOW);
  assert.ok(d.allowed, 'битый снимок сломал паузер');
});

test('мусор в снимке санитизируется, а не роняет паузер', () => {
  const cfg = { minDelayMs: 0, maxDelayMs: 0, jitterMinutes: 0, workStartHour: 0, workEndHour: 24 };
  const dirty = {
    cooldownMs: 'через час' as never,
    failAt: NaN,
    failKind: 'blocked' as const,
    failStreak: -5,
    retryAfterUntil: Infinity,
    retryDetail: 42 as never,
    blockUntil: -100,
  };
  const p = antiBan.createPacing(cfg);
  p.restore(dirty as never);
  // Отрицательный/NaN/Infinity мусор обнулён: паузер разрешает отправку.
  const d = p.decide(NOW);
  assert.ok(d.allowed, `мусор заблокировал паузер: ${JSON.stringify(d)}`);
  // Корректная часть мусора применяется: валидный failKind переживает restore.
  const q = antiBan.createPacing(cfg);
  q.restore({ ...dirty, failAt: NOW, failStreak: 2, failKind: 'blocked' } as never);
  const d2 = q.decide(NOW + 1000);
  assert.equal(d2.allowed, false, 'валидный blocked не восстановлен');
  assert.equal(d2.reason, 'backoff');
});

test('pacingFor сохраняет снимок на живую отправку и поднимает его после рестарта', () => {
  seedUser(1);
  const cfg = {
    minDelayMs: 60_000,
    maxDelayMs: 60_000,
    jitterMinutes: 0,
    workStartHour: 0,
    workEndHour: 24,
  };
  const p1 = pacingFor(1, cfg, () => NOW);
  const first = p1.decide(NOW);
  assert.ok(first.allowed, 'первое решение не allowed');
  p1.recordSent();
  const stored = db.prepare('SELECT value FROM meta WHERE key = ?').get('pacing:1') as
    | { value: string }
    | undefined;
  assert.ok(stored, 'снимок не записан');

  // Рестарт процесса: кэш паузеров пуст, часы те же.
  resetPacing();
  const p2 = pacingFor(1, cfg, () => NOW);
  const second = p2.decide(NOW);
  assert.equal(second.allowed, false, 'после рестарта пауза потеряна');
  assert.equal(second.reason, 'backoff', 'потерян именно cooldown');
});

test('гидратация прошлого снимок не перезаписывает', () => {
  seedUser(2);
  const cfg = {
    minDelayMs: 60_000,
    maxDelayMs: 60_000,
    jitterMinutes: 0,
    workStartHour: 0,
    workEndHour: 24,
  };
  const p1 = pacingFor(2, cfg, () => NOW);
  p1.recordSent();
  const before = (
    db.prepare('SELECT value FROM meta WHERE key = ?').get('pacing:2') as { value: string }
  ).value;

  resetPacing();
  // Тот же пользователь, но часы ушли вперёд: гидратация дёргает recordSent
  // с явными метками — снимок обязан остаться прежним.
  pacingFor(2, cfg, () => NOW + 3_600_000);
  const after = (
    db.prepare('SELECT value FROM meta WHERE key = ?').get('pacing:2') as { value: string }
  ).value;
  assert.equal(after, before, 'гидратация перезаписала живой снимок');
});
