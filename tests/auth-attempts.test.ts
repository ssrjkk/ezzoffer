import test, { before } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Персистентные счётчики неудачных попыток.
 *
 * In-memory бакеты сбрасывались рестартом и не делились между инстансами.
 * Здесь окно и счётчик живут в таблице auth_attempts: защита переживает
 * и рестарт, и второй процесс.
 */

let db: ReturnType<typeof import('../src/lib/db').createDatabase>;
let attempts: typeof import('../src/lib/auth-attempts');

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  db = (await import('../src/lib/db')).db;
  attempts = await import('../src/lib/auth-attempts');
});

function clean() {
  db.prepare('DELETE FROM auth_attempts').run();
}

test('10 неудач подряд закрывают вход, 11-я — 429', () => {
  clean();
  const opts = { windowMs: 15 * 60 * 1000, max: 10 };
  for (let i = 0; i < 10; i++) {
    assert.equal(attempts.recordAuthFailure('a@test', opts).allowed, true, `попытка ${i + 1}`);
  }
  const blocked = attempts.recordAuthFailure('a@test', opts);
  assert.equal(blocked.allowed, false, 'лимит не сработал');
  assert.ok(blocked.retryAfterSeconds >= 1, 'нет Retry-After');
});

test('успех обнуляет счётчик', () => {
  clean();
  const opts = { windowMs: 15 * 60 * 1000, max: 2 };
  attempts.recordAuthFailure('b@test', opts);
  attempts.recordAuthFailure('b@test', opts);
  assert.equal(attempts.recordAuthFailure('b@test', opts).allowed, false);
  attempts.clearAuthFailures('b@test');
  assert.equal(attempts.recordAuthFailure('b@test', opts).allowed, true, 'сброс не сработал');
});

test('протухшее окно начинает заново', () => {
  clean();
  const opts = { windowMs: 1000, max: 1 };
  assert.equal(attempts.recordAuthFailure('c@test', opts, 0).allowed, true);
  assert.equal(attempts.recordAuthFailure('c@test', opts, 500).allowed, false);
  assert.equal(
    attempts.recordAuthFailure('c@test', opts, 2000).allowed,
    true,
    'окно не сбросилось по времени',
  );
});

test('разные ключи не мешают друг другу', () => {
  clean();
  const opts = { windowMs: 60_000, max: 1 };
  attempts.recordAuthFailure('d1@test', opts);
  assert.equal(attempts.recordAuthFailure('d1@test', opts).allowed, false);
  assert.equal(attempts.recordAuthFailure('d2@test', opts).allowed, true);
});
