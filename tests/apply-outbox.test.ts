import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Outbox намерений: claim до сети, удаление после записи.
 *
 * Закрывает окно «POST ушёл, а записи нет»: сбой между ними оставлял
 * отправку без истории. Без outbox повтор упирался в пустоту проверки
 * дублей и слал второй раз; с ним — либо строка уже есть, либо заявка
 * висит и повтор ждёт сборщика.
 */

let db: ReturnType<typeof import('../src/lib/db').createDatabase>;
let outbox: typeof import('../src/lib/apply-outbox');

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  db = (await import('../src/lib/db')).db;
  outbox = await import('../src/lib/apply-outbox');
  db.prepare(
    `INSERT INTO users (id, email, password_hash, plan, plan_expires_at, created_at, email_verified)
     VALUES (1, 'outbox@test', 'h', 'pro', ?, ?, 1)`,
  ).run(Date.now() + 100000, Date.now());
});

beforeEach(() => {
  db.prepare('DELETE FROM apply_outbox').run();
  db.prepare('DELETE FROM applications').run();
});

function claim() {
  return outbox.claimSend({
    userId: 1,
    jobSlug: 'hh-x',
    resumeId: 'r1',
    letterId: null,
    message: '',
    searchId: null,
  });
}

test('повторный claim той же связки — дубликат, а не вторая строка', () => {
  const first = claim();
  assert.ok(!('duplicate' in first), 'первый claim обязан проходить');
  const second = claim();
  assert.ok('duplicate' in second, 'второй claim той же связки обязан быть дубликатом');
  const count = db.prepare('SELECT COUNT(*) AS c FROM apply_outbox').get() as { c: number };
  assert.equal(count.c, 1);
});

test('выполненная заявка удаляется', () => {
  const c = claim();
  assert.ok(!('duplicate' in c));
  outbox.completeSend(c.id);
  const count = db.prepare('SELECT COUNT(*) AS c FROM apply_outbox').get() as { c: number };
  assert.equal(count.c, 0);
});

test('сборщик трогает только протухшие', () => {
  claim();
  const sweptFresh = outbox.sweepStaleOutbox();
  assert.equal(sweptFresh.length, 0, 'свежая заявка подметена раньше времени');

  db.prepare('UPDATE apply_outbox SET created_at = ?').run(
    Date.now() - 31 * 60 * 1000,
  );
  const swept = outbox.sweepStaleOutbox();
  assert.equal(swept.length, 1);
  assert.equal(swept[0]!.userId, 1);
  assert.equal(swept[0]!.jobSlug, 'hh-x');
  assert.equal(swept[0]!.lost, true, 'без строки отклика протухшая заявка — потеря');
  const count = db.prepare('SELECT COUNT(*) AS c FROM apply_outbox').get() as { c: number };
  assert.equal(count.c, 0, 'протухшая заявка осталась висеть');
});

test('сборщик различает «записано» и «потеряно»', () => {
  claim();
  db.prepare(
    `INSERT INTO applications (user_id, job_slug, status, origin, sent_at) VALUES (1, 'hh-x', 'sent', 'real', ?)`,
  ).run(Date.now());
  db.prepare('UPDATE apply_outbox SET created_at = ?').run(Date.now() - 31 * 60 * 1000);
  const swept = outbox.sweepStaleOutbox();
  assert.equal(swept.length, 1);
  assert.equal(swept[0]!.lost, false, 'записанный отклик помечен потерянным');
});
