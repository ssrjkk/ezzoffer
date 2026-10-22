import test, { before } from 'node:test';
import assert from 'node:assert/strict';

/**
 * POST /api/resumes/[id]/clone — копия резюме на hh.ru.
 *
 * Проверяется только контроль доступа и предусловия: сам обмен с hh
 * покрыт юнит-тестами cloneHhResume (там подменяется fetch).
 */

let db: ReturnType<typeof import('../src/lib/db').createDatabase>;

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  delete process.env.EZOFFER_TOKEN_KEY;
  db = (await import('../src/lib/db')).db;
  const { loginAs } = await import('./helpers/route-session');
  loginAs({ id: 1 });
  db.prepare(
    `INSERT INTO users (id, email, password_hash, plan, plan_expires_at, created_at, email_verified)
     VALUES (1, 'clone@test', 'h', 'pro', ?, ?, 1)`,
  ).run(Date.now() + 100000, Date.now());
  db.prepare(
    `INSERT INTO resumes (id, user_id, title, content, hh_id, created_at, updated_at)
     VALUES (1, 1, 'Ручное', 'текст', NULL, ?, ?), (2, 1, 'Привязанное', 'текст', 'hh-9', ?, ?)`,
  ).run(Date.now(), Date.now(), Date.now(), Date.now());
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });

test('чужого или несуществующего резюме нет', async () => {
  const { POST } = await import('../src/app/api/resumes/[id]/clone/route');
  const res = await POST(new Request('http://localhost/x', { method: 'POST' }), params('999'));
  assert.equal(res.status, 404);
});

test('непривязанное резюме клонировать нечем', async () => {
  const { POST } = await import('../src/app/api/resumes/[id]/clone/route');
  const res = await POST(new Request('http://localhost/x', { method: 'POST' }), params('1'));
  assert.equal(res.status, 400, 'ожидался честный 400, а не попытка копировать NULL');
});

test('без подключённого hh — 401, а не падение', async () => {
  const { POST } = await import('../src/app/api/resumes/[id]/clone/route');
  const res = await POST(new Request('http://localhost/x', { method: 'POST' }), params('2'));
  assert.equal(res.status, 401);
});
