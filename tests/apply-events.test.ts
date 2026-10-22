import test, { before } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Журнал внешних эффектов: пишется всегда, не переписывается никогда.
 */

let db: ReturnType<typeof import('../src/lib/db').createDatabase>;
let journal: typeof import('../src/lib/apply-events');

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  db = (await import('../src/lib/db')).db;
  journal = await import('../src/lib/apply-events');
  db.prepare(
    `INSERT INTO users (id, email, password_hash, plan, plan_expires_at, created_at, email_verified)
     VALUES (1, 'journal@test', 'h', 'none', NULL, ?, 1)`,
  ).run(Date.now());
});

test('запись и чтение журнала', () => {
  journal.logApplyEvent(1, 'hh-1', 'sent', 'с письмом');
  journal.logApplyEvent(1, 'hh-2', 'failed', '403');
  const rows = journal.listApplyEvents(1);
  assert.equal(rows.length, 2, `в журнале ${rows.length} записей вместо двух`);
  assert.equal(rows[0]!.job_slug, 'hh-2', 'порядок — новые первыми');
  assert.equal(rows[1]!.kind, 'sent');
});

test('чужой пользователь журнал не видит', () => {
  const rows = journal.listApplyEvents(999);
  assert.deepEqual(rows, []);
});

test('лимит выдачи ограничен сверху', () => {
  for (let i = 0; i < 5; i++) journal.logApplyEvent(1, `hh-x${i}`, 'dry');
  const rows = journal.listApplyEvents(1, 3);
  assert.equal(rows.length, 3);
});
