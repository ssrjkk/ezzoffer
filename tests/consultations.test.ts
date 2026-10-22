import test, { before } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Заявки на консультации: создание, уведомление владельца, отметка.
 *
 * Главная дыра была не в коде, а в процессе: заявка писалась в таблицу,
 * которую никто не читал. Теперь создание шлёт уведомление админу
 * (best-effort), а отметка «проведена» доступна человеку.
 */

let db: ReturnType<typeof import('../src/lib/db').createDatabase>;

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.ADMIN_TELEGRAM_CHAT_ID;
  db = (await import('../src/lib/db')).db;
  const { loginAs } = await import('./helpers/route-session');
  loginAs({ id: 1, email: 'c@test' });
  db.prepare(
    `INSERT INTO users (id, email, password_hash, plan, plan_expires_at, created_at, email_verified)
     VALUES (1, 'c@test', 'h', 'pro', ?, ?, 1)`,
  ).run(Date.now() + 100000, Date.now());
});

function post(body: unknown): Request {
  return new Request('http://localhost/api/consultations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(body: unknown): Request {
  return new Request('http://localhost/api/consultations', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('заявка создаётся и без настроенного бота (уведомление пропускается)', async () => {
  const { POST } = await import('../src/app/api/consultations/route');
  const res = await POST(post({ theme: 'Разбор резюме', note: 'привет' }));
  assert.equal(res.status, 201);
  const body = (await res.json()) as { consultation: { id: number; done: number } };
  assert.ok(body.consultation.id > 0);
  assert.equal(body.consultation.done, 0);
});

test('владелец отмечает свою заявку проведённой', async () => {
  const { POST, PATCH } = await import('../src/app/api/consultations/route');
  const created = (await (
    await POST(post({ theme: 'Стратегия' }))
  ).json()) as { consultation: { id: number } };
  const res = await PATCH(patch({ id: created.consultation.id, done: true }));
  assert.equal(res.status, 200);
  const row = db
    .prepare('SELECT done FROM consultations WHERE id = ?')
    .get(created.consultation.id) as { done: number };
  assert.equal(row.done, 1);
});

test('чужая заявка неотличима от несуществующей', async () => {
  const { PATCH } = await import('../src/app/api/consultations/route');
  const res = await PATCH(patch({ id: 999_999, done: true }));
  assert.equal(res.status, 404);
});

test('мусорный id отклоняется', async () => {
  const { PATCH } = await import('../src/app/api/consultations/route');
  const res = await PATCH(patch({ id: 'x', done: true }));
  assert.equal(res.status, 400);
});
