import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/**
 * Сессии: хеш вместо открытого текста + абсолютный потолок жизни.
 *
 * Две дыры, которые закрываются здесь:
 *
 * 1. Токен лежал в БД открытым текстом — копия файла давала готовые сессии.
 *    Теперь пишется sha256, а угонщик с копией базы получает только хеши.
 * 2. Ротация продлевала expires_at бесконечно — цепочка сессий жила вечно.
 *    Теперь created_at + 90 дней гасит цепочку: дальше только новый вход.
 */

let db: ReturnType<typeof import('../src/lib/db').createDatabase>;
let auth: typeof import('../src/lib/auth');

before(async () => {
  // Без helpers/route-session: его импорт мокает весь модуль auth (mock.module),
  // и дальше тестировался бы мок, а не настоящий код. Здесь нужен настоящий.
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  db = (await import('../src/lib/db')).db;
  auth = await import('../src/lib/auth');
  db.prepare(
    `INSERT INTO users (id, email, password_hash, plan, plan_expires_at, created_at, email_verified)
     VALUES (1, 'sess@test', 'h', 'none', NULL, ?, 1)`,
  ).run(Date.now());
});

test('токен сессии хранится хешем, а не открытым текстом', () => {
  const { token } = auth.createSession(1);
  assert.equal(token.length, 64, 'наружу отдаётся полный токен');
  const row = db.prepare('SELECT token FROM sessions WHERE user_id = 1').get() as {
    token: string;
  };
  assert.notEqual(row.token, token, 'в БД лежит открытый токен — копия базы даёт сессии');
  assert.equal(
    row.token,
    createHash('sha256').update(token).digest('hex'),
    'в БД не sha256 токена',
  );
  assert.ok(auth.getSessionUser(token), 'хеш ломает вход по свежей сессии');
});

test('подделанный и чужой токены не проходят', () => {
  assert.equal(auth.getSessionUser('0'.repeat(64)), undefined);
  assert.equal(auth.getSessionUser(undefined), undefined);
  assert.equal(auth.getSessionUser(''), undefined);
});

test('ротация выдаёт новый токен и гасит старый', () => {
  const { token } = auth.createSession(1);
  const rotated = auth.rotateSession(token);
  assert.ok(rotated && rotated.token !== token, 'ротации нет');
  assert.equal(auth.getSessionUser(token), undefined, 'старый токен жив после ротации');
  assert.ok(auth.getSessionUser(rotated.token), 'новый токен не работает');
});

test('абсолютный потолок гасит вечную цепочку', () => {
  const { token } = auth.createSession(1);
  const old = Date.now() - 91 * 24 * 60 * 60 * 1000;
  db.prepare('UPDATE sessions SET created_at = ?').run(old);
  assert.equal(auth.getSessionUser(token), undefined, 'сессия старше 90 дней жива');
  assert.equal(auth.rotateSession(token), null, 'ротация продлила мёртвую цепочку');
});

test('свежая сессия живёт, created_at выставлен', () => {
  const { token } = auth.createSession(1);
  const row = db.prepare('SELECT created_at, expires_at FROM sessions').get() as {
    created_at: number;
    expires_at: number;
  };
  assert.ok(row.created_at > 0, 'created_at не выставлен');
  assert.ok(row.expires_at > Date.now(), 'скользящий срок сломан');
  assert.ok(auth.getSessionUser(token), 'свежая сессия не работает');
});
