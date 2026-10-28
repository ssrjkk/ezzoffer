import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Фаза уведомлений имеет собственный фазовый лок — а не хвост sync-фазы.
 *
 * Рассылка шла под sync-локом с check-then-set метками: при перехвате лока
 * по TTL (длинная синхронизация) два тика слали одинаковые дайджесты и
 * предупреждения всем чатам. Свой лок — пропуск тика вместо дубля.
 */

type Database = ReturnType<typeof import('../src/lib/db').createDatabase>;

let db: Database;
let sent: { chatId: string; text: string }[];

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  db = (await import('../src/lib/db')).db;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/negotiations')) {
      return { ok: false, status: 500, text: async () => 'error' } as unknown as Response;
    }
    if (u.includes('/sendMessage')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { chat_id?: string; text?: string };
      sent.push({ chatId: String(body.chat_id ?? ''), text: String(body.text ?? '') });
      return { ok: true, status: 200, text: async () => '{"ok":true}' } as unknown as Response;
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ items: [] }) };
  }) as unknown as typeof globalThis.fetch;
});

beforeEach(() => {
  db.exec('DELETE FROM apply_events; DELETE FROM applications; DELETE FROM searches; DELETE FROM resumes; DELETE FROM users; DELETE FROM meta;');
  sent = [];
  db.prepare(
    `INSERT INTO users (id, email, password_hash, plan, plan_expires_at, created_at,
      hh_token, hh_token_expires_at, hh_resume_id, telegram_chat_id, mode)
     VALUES (1, 'u@example.com', 'h', 'pro', ?, ?, 'tok', ?, 'res1', 'chat-1', 'live')`,
  ).run(Date.now() + 30 * 86_400_000, Date.now(), Date.now() - 1000);
});

test('занятый фазовый лок пропускает уведомления, а не дублирует их', async () => {
  const { tryLockSession, runScheduledJobs, TELEGRAM_LOCK_KEY } = await import(
    '../src/lib/scheduler'
  );
  const lock = tryLockSession(db, TELEGRAM_LOCK_KEY);
  assert.ok(lock, 'не удалось занять фазовый лок');
  try {
    await runScheduledJobs();
    assert.equal(sent.length, 0, 'уведомления ушли мимо занятого лока — возможны дубли');
  } finally {
    lock.release();
  }
  await runScheduledJobs();
  assert.equal(sent.length, 1, `после снятия лока уведомление не ушло: ${JSON.stringify(sent)}`);
  assert.match(sent[0]!.text, /истёк/, 'ушло не то уведомление');
});
