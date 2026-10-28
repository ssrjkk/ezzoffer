import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Предупреждение об истёкшем токене hh.ru.
 *
 * Дыра: 401 от hh («token») тихо уходил в failed — и в плановом прогоне, и в
 * синхронизации. Человек видел только «откликов мало» без зацепок, хотя
 * лечится всё перепривязкой за минуту. Теперь три пути будят человека:
 *
 *  1. событийный в автоотклике (kind === 'token' → notifyHhTokenExpiredForUser),
 *  2. событийный в синхронизации (401 → authFailed → планировщик уведомляет),
 *  3. плановый обход заведомо мёртвых подключений (sendHhTokenWarnings).
 *
 * Здесь — плановый обход и дедуп. Событийный путь синка — в hh-sync-auth.test.ts.
 */

type Database = ReturnType<typeof import('../src/lib/db').createDatabase>;

let db: Database;
let sendHhTokenWarnings: typeof import('../src/lib/telegram-digest').sendHhTokenWarnings;
let notifyHhTokenExpiredForUser: typeof import('../src/lib/telegram-digest').notifyHhTokenExpiredForUser;
let clearHhTokenWarning: typeof import('../src/lib/telegram-digest').clearHhTokenWarning;

let lastText = '';
const bodies: { chat_id?: string; text?: string }[] = [];
let savedFetch: typeof globalThis.fetch;

function seedUser(over: {
  id?: number;
  chat?: string | null;
  token?: string | null;
  expiresAt?: number | null;
  refresh?: string | null;
  resume?: string | null;
} = {}): number {
  const id = over.id ?? 1;
  db.prepare(
    `INSERT INTO users (id, email, password_hash, plan, plan_expires_at, created_at,
      telegram_chat_id, hh_token, hh_token_expires_at, hh_refresh_token, hh_resume_id)
     VALUES (?, ?, 'h', 'pro', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    `u${id}@example.com`,
    Date.now() + 100_000,
    Date.now(),
    over.chat === undefined ? 'chat-1' : over.chat,
    over.token === undefined ? 'tok' : over.token,
    over.expiresAt === undefined ? Date.now() - 1000 : over.expiresAt,
    over.refresh ?? null,
    over.resume === undefined ? 'res1' : over.resume,
  );
  return id;
}

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  // Отключаем OAuth-приложение: путь обновления закрыт, все протухшие
  // токены — заведомо мёртвые и должны предупреждаться.
  delete process.env.HH_CLIENT_ID;
  delete process.env.HH_CLIENT_SECRET;
  delete process.env.HH_REDIRECT_URI;
  db = (await import('../src/lib/db')).db;
  const digest = await import('../src/lib/telegram-digest');
  sendHhTokenWarnings = digest.sendHhTokenWarnings;
  notifyHhTokenExpiredForUser = digest.notifyHhTokenExpiredForUser;
  clearHhTokenWarning = digest.clearHhTokenWarning;

  savedFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (!String(url).includes('/sendMessage')) {
      return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
    }
    const parsed = JSON.parse(String(init?.body ?? '{}')) as { chat_id?: string; text?: string };
    bodies.push(parsed);
    lastText = parsed.text ?? '';
    return { ok: true, status: 200, text: async () => '{"ok":true}' } as unknown as Response;
  }) as typeof globalThis.fetch;
});

after(() => {
  globalThis.fetch = savedFetch;
});

beforeEach(() => {
  db.exec('DELETE FROM apply_events; DELETE FROM applications; DELETE FROM searches; DELETE FROM users; DELETE FROM meta;');
  bodies.length = 0;
  lastText = '';
});

test('протухший токен без пути обновления предупреждается один раз', async () => {
  seedUser();
  assert.equal(await sendHhTokenWarnings(), 1, 'предупреждение не ушло');
  assert.match(lastText, /истёк/i, 'нет слова про истёкший сеанс');
  assert.match(lastText, /перепривяжите/i, 'не сказано, что делать');
  assert.equal(await sendHhTokenWarnings(), 0, 'предупреждение ушло повторно');
});

test('живой токен не предупреждается', async () => {
  seedUser({ expiresAt: Date.now() + 3_600_000 });
  assert.equal(await sendHhTokenWarnings(), 0, 'живой токен предупредили');
});

test('токен без срока не хоронят заранее', async () => {
  // Срок неизвестен — getValidHhToken такие пробует, токен может быть жив.
  seedUser({ expiresAt: null });
  assert.equal(await sendHhTokenWarnings(), 0, 'токен без срока предупредили');
});

test('без привязанного чата предупреждать некого', async () => {
  seedUser({ chat: null });
  assert.equal(await sendHhTokenWarnings(), 0, 'ушло сообщение в никуда');
});

test('без резюме подключение не было закончено — не спамим', async () => {
  seedUser({ resume: null });
  assert.equal(await sendHhTokenWarnings(), 0, 'предупредили незавершённое подключение');
});

test('путь обновления открыт — исход решит живая попытка', async () => {
  process.env.HH_CLIENT_ID = 'id';
  process.env.HH_CLIENT_SECRET = 'secret';
  process.env.HH_REDIRECT_URI = 'https://example.com/api/hh/callback';
  try {
    seedUser({ refresh: 'ref-token' });
    assert.equal(await sendHhTokenWarnings(), 0, 'предупредили при живом refresh_token');
  } finally {
    delete process.env.HH_CLIENT_ID;
    delete process.env.HH_CLIENT_SECRET;
    delete process.env.HH_REDIRECT_URI;
  }
});

test('успех снимает отметку — следующий сбой предупредит заново', async () => {
  const uid = seedUser();
  assert.equal(await sendHhTokenWarnings(), 1);
  clearHhTokenWarning(uid);
  assert.equal(await sendHhTokenWarnings(), 1, 'после снятия отметки предупреждение не пришло');
});

test('прямое уведомление дедупится на сутки', async () => {
  const uid = seedUser();
  const now = Date.now();
  assert.equal(await notifyHhTokenExpiredForUser(uid, now), true);
  assert.equal(await notifyHhTokenExpiredForUser(uid, now + 1000), false, 'дубль внутри суток');
  assert.equal(
    await notifyHhTokenExpiredForUser(uid, now + 25 * 60 * 60 * 1000),
    true,
    'через сутки не напомнили',
  );
});
