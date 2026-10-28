import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Сторож застоя каталога: при живых поисках и давно не обновлявшемся каталоге
 * владелец получает одно предупреждение, а не тишину.
 *
 * Каталог обновляется только под активные поиски. Если поиски есть, а
 * обновления давно не было (легли провайдеры или заклинило фазу), узнают
 * об этом по отсутствию свежих вакансий — то есть никак. Предупреждение
 * уходит владельцу (ADMIN_TELEGRAM_CHAT_ID), а не всем чатам: конкретному
 * пользователю жаловаться не на что, чинить — владельцу.
 */

type Database = ReturnType<typeof import('../src/lib/db').createDatabase>;

let db: Database;
let checkCatalogStall: typeof import('../src/lib/scheduler').checkCatalogStall;

const bodies: { chat_id?: string; text?: string }[] = [];
let savedFetch: typeof globalThis.fetch;
let savedAdmin: string | undefined;

const STALL_MS = 12 * 60 * 60 * 1000;

function seedActiveSearch(): void {
  const uid = Number(
    db
      .prepare(
        "INSERT INTO users (email, password_hash, plan, plan_expires_at, created_at) VALUES ('u@example.com', 'h', 'pro', ?, ?)",
      )
      .run(Date.now() + 100_000, Date.now()).lastInsertRowid,
  );
  db.prepare(
    'INSERT INTO searches (user_id, title, keywords, city, active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(uid, 's', 'react', 'moscow', 1, Date.now());
}

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  savedAdmin = process.env.ADMIN_TELEGRAM_CHAT_ID;
  process.env.ADMIN_TELEGRAM_CHAT_ID = 'admin-chat';
  db = (await import('../src/lib/db')).db;
  ({ checkCatalogStall } = await import('../src/lib/scheduler'));

  savedFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (!String(url).includes('/sendMessage')) {
      return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
    }
    const parsed = JSON.parse(String(init?.body ?? '{}')) as { chat_id?: string; text?: string };
    bodies.push(parsed);
    return { ok: true, status: 200, text: async () => '{"ok":true}' } as unknown as Response;
  }) as typeof globalThis.fetch;
});

after(() => {
  globalThis.fetch = savedFetch;
  if (savedAdmin === undefined) delete process.env.ADMIN_TELEGRAM_CHAT_ID;
  else process.env.ADMIN_TELEGRAM_CHAT_ID = savedAdmin;
});

beforeEach(() => {
  db.exec('DELETE FROM searches; DELETE FROM users; DELETE FROM meta;');
  bodies.length = 0;
});

test('без активных поисков сторожить нечего', async () => {
  assert.equal(await checkCatalogStall(), false);
  assert.equal(bodies.length, 0, 'ушло сообщение без поисков');
});

test('свежий каталог — тишина', async () => {
  seedActiveSearch();
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(
    'scheduler:catalog_refresh',
    String(Date.now()),
  );
  assert.equal(await checkCatalogStall(), false);
  assert.equal(bodies.length, 0, 'ушло сообщение при свежем каталоге');
});

test('застой при живых поисках предупреждает владельца один раз', async () => {
  seedActiveSearch();
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(
    'scheduler:catalog_refresh',
    String(Date.now() - STALL_MS - 1000),
  );
  assert.equal(await checkCatalogStall(), true, 'предупреждение не ушло');
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0]?.chat_id, 'admin-chat', 'ушло не владельцу');
  assert.match(bodies[0]?.text ?? '', /каталог/i, 'не сказано про каталог');
  assert.equal(await checkCatalogStall(), false, 'предупреждение ушло повторно');
});

test('каталог ожил — отметка снята, следующий застой предупредит заново', async () => {
  seedActiveSearch();
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(
    'scheduler:catalog_refresh',
    String(Date.now() - STALL_MS - 1000),
  );
  assert.equal(await checkCatalogStall(), true);
  // Каталог обновился: свежая метка снимает предупреждение о застое.
  db.prepare('UPDATE meta SET value = ? WHERE key = ?').run(
    String(Date.now()),
    'scheduler:catalog_refresh',
  );
  assert.equal(await checkCatalogStall(), false);
  const marked = db
    .prepare("SELECT value FROM meta WHERE key = 'catalog:stall-warned'")
    .get() as { value: string } | undefined;
  assert.equal(marked, undefined, 'отметка о застое не снята');
  // И снова застой — предупреждаем заново.
  db.prepare('UPDATE meta SET value = ? WHERE key = ?').run(
    String(Date.now() - STALL_MS - 1000),
    'scheduler:catalog_refresh',
  );
  assert.equal(await checkCatalogStall(), true, 'повторный застой промолчал');
});

test('без чата владельца — тишина без падения', async () => {
  delete process.env.ADMIN_TELEGRAM_CHAT_ID;
  try {
    seedActiveSearch();
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(
      'scheduler:catalog_refresh',
      String(Date.now() - STALL_MS - 1000),
    );
    assert.equal(await checkCatalogStall(), false, 'без админа должно молчать');
  } finally {
    process.env.ADMIN_TELEGRAM_CHAT_ID = 'admin-chat';
  }
});
