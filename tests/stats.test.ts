import test, { before } from 'node:test';
import assert from 'node:assert/strict';

type Database = ReturnType<typeof import('../src/lib/db').createDatabase>;
let db: Database;
let getStats: (userId: number) => import('../src/lib/stats').Stats;

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  const dbMod = await import('../src/lib/db');
  db = dbMod.db;
  const statsMod = await import('../src/lib/stats');
  getStats = statsMod.getStats;
});

function insertUser(email: string) {
  return Number(
    db
      .prepare(
        'INSERT INTO users (email, password_hash, plan, plan_expires_at, created_at) VALUES (?,?,?,?,?)',
      )
      .run(email, 'h', 'pro', Date.now() + 100000, Date.now()).lastInsertRowid,
  );
}

test('getStats считает реальные отклики из БД (без симуляции)', () => {
  const uid = insertUser('stats@example.com');
  const now = Date.now();
  const ins = db.prepare(
    `INSERT INTO applications (user_id, job_slug, status, response, sent_at, viewed_at, responded_at, withdrawn)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
  );
  ins.run(uid, 'a', 'sent', '', now - 1000, null, null);
  ins.run(uid, 'b', 'viewed', '', now - 2000, now - 1000, null);
  ins.run(uid, 'c', 'responded', 'interview', now - 3000, now - 2000, now - 1000);
  ins.run(uid, 'd', 'responded', 'decline', now - 4000, now - 3000, now - 2000);
  ins.run(uid, 'e', 'sent', '', now - 5000, null, null);
  db.prepare("UPDATE applications SET withdrawn = 1 WHERE job_slug = 'e'").run();

  const s = getStats(uid);
  assert.equal(s.sent, 4);
  assert.equal(s.viewed, 3);
  assert.equal(s.responded, 2);
  assert.equal(s.invited, 1);
  assert.equal(s.declined, 1);
  assert.equal(s.questions, 0);
  assert.equal(s.withdrawn, 1);
  // Отозванный считается в today: внешняя отправка состоялась и слот дневного
  // лимита она съела. Иначе «отправить → отозвать → отправить» давал бы
  // бесконечные отклики мимо лимита (и мимо счётчика в /api/applications).
  // Воронка (sent/viewed/…) отозванные по-прежнему исключает.
  assert.equal(s.today, 5);
  assert.equal(s.todayLimit, 100);
  assert.equal(s.series.length, 7);
  assert.equal(s.series[6].sent, 4);
});

test('getStats без откликов возвращает нули и подсказку', () => {
  const uid = insertUser('stats2@example.com');
  const s = getStats(uid);
  assert.equal(s.sent, 0);
  assert.equal(s.viewRate, 0);
  assert.ok(s.hint);
});

test('бенчмарки воронки считаются от отправленных и требуют выборку', () => {
  const uid = insertUser('stats-bench@example.com');
  const now = Date.now();
  const ins = db.prepare(
    `INSERT INTO applications (user_id, job_slug, status, response, sent_at, viewed_at, responded_at, withdrawn)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
  );
  // 20 отправленных, 2 ответа (10%), 1 приглашение: ровно на ориентирах.
  for (let i = 0; i < 20; i++) {
    const responded = i < 2;
    ins.run(
      uid,
      `b-${i}`,
      responded ? 'responded' : 'sent',
      i === 0 ? 'interview' : responded ? 'question' : '',
      now - 1000,
      now - 500,
      responded ? now - 100 : null,
    );
  }
  const s = getStats(uid);
  assert.equal(s.benchmarks.enough, true, '20 откликов обязаны считаться выборкой');
  assert.equal(s.benchmarks.replyRate, 10, `доля ответов: ${s.benchmarks.replyRate}`);
  assert.equal(s.benchmarks.replyRef, 10);
  assert.equal(s.benchmarks.inviteRate, 5, `доля приглашений: ${s.benchmarks.inviteRate}`);
  assert.equal(s.benchmarks.inviteRef, 2);
});

test('бенчмарки молчат при малой выборке', () => {
  const uid = insertUser('stats-bench-small@example.com');
  const s = getStats(uid);
  assert.equal(s.benchmarks.enough, false, 'ноль откликов — не выборка');
});

test('недельный темп ответов считается по responded_at, а не из series', () => {
  const uid = insertUser('stats-week@example.com');
  const now = Date.now();
  const ins = db.prepare(
    `INSERT INTO applications (user_id, job_slug, status, response, sent_at, viewed_at, responded_at, withdrawn)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
  );
  // Ответ пришёл на этой неделе; отправка могла быть раньше — важно responded_at.
  ins.run(uid, 'w-1', 'responded', 'question', now - 30 * 86_400_000, now - 1000, now - 500);
  ins.run(uid, 'w-2', 'sent', '', now - 1000, null, null);
  const s = getStats(uid);
  assert.equal(s.respondedWeek, 1, `недельных ответов: ${s.respondedWeek}`);
});
