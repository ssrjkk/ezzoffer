import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Важно: ни одного статического импорта модулей, которые тянут ./db.
 * Паттерн — из telegram-keyboard.test.ts: БД поднимается только после
 * EZOFFER_DB_PATH в before(), иначе тест пишет в рабочую базу.
 */

type Database = ReturnType<typeof import('../src/lib/db').createDatabase>;

let db: Database;
let bot: typeof import('../src/lib/telegram-bot');
let admin: typeof import('../src/lib/telegram-admin');
let sent: { chatId: string; text: string; keyboard?: unknown }[];
let edited: { chatId: string; messageId: number; text: string }[];
let answered: { id: string; text?: string }[];

const OWNER = '397602448';
const STRANGER = '999';

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.OWNER_ID = OWNER;
  db = (await import('../src/lib/db')).db;
  bot = await import('../src/lib/telegram-bot');
  admin = await import('../src/lib/telegram-admin');

  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const body = (() => {
      try {
        return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      } catch {
        return {};
      }
    })();
    if (u.includes('/sendMessage')) {
      sent.push({
        chatId: String(body.chat_id ?? ''),
        text: String(body.text ?? ''),
        keyboard: body.reply_markup,
      });
      return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
    }
    if (u.includes('/editMessageText')) {
      edited.push({
        chatId: String(body.chat_id ?? ''),
        messageId: Number(body.message_id),
        text: String(body.text ?? ''),
      });
      return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
    }
    if (u.includes('/answerCallbackQuery')) {
      answered.push({ id: String(body.callback_query_id ?? ''), text: body.text as string });
      return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
    }
    return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
  }) as typeof globalThis.fetch;
});

beforeEach(() => {
  db.exec(
    'DELETE FROM apply_events; DELETE FROM auth_attempts; DELETE FROM applications; DELETE FROM searches; DELETE FROM resumes; DELETE FROM users; DELETE FROM vacancies; DELETE FROM meta;',
  );
  sent = [];
  edited = [];
  answered = [];
  process.env.OWNER_ID = OWNER;
});

function seedUser(over: {
  id: number;
  plan?: string;
  chat?: string | null;
  token?: string | null;
  expires?: number | null;
  refresh?: string | null;
  resume?: string | null;
}): void {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, plan, plan_expires_at, created_at,
      hh_token, hh_token_expires_at, hh_refresh_token, hh_resume_id, telegram_chat_id, mode)
     VALUES (?, ?, 'h', ?, ?, ?, ?, ?, ?, ?, ?, 'live')`,
  ).run(
    over.id,
    `u${over.id}@example.com`,
    over.plan ?? 'pro',
    Date.now() + 100_000,
    Date.now(),
    over.token ?? null,
    over.expires ?? null,
    over.refresh ?? null,
    over.resume ?? null,
    over.chat ?? null,
  );
}

function seedSent(userId: number, n: number): void {
  const ins = db.prepare(
    'INSERT INTO applications (user_id, job_slug, status, sent_at) VALUES (?, ?, ?, ?)',
  );
  for (let i = 0; i < n; i++) ins.run(userId, `hh-s-${i}`, 'sent', Date.now());
}

async function command(chat: string, text: string): Promise<void> {
  await bot.handleUpdate({
    update_id: Math.floor(Math.random() * 1e9),
    message: { chat: { id: Number(chat) }, text },
  });
}

async function click(chat: string, data: string): Promise<void> {
  await bot.handleUpdate({
    update_id: Math.floor(Math.random() * 1e9),
    callback_query: { id: 'cb1', data, message_id: 100, chat: { id: Number(chat) } },
  });
}

// ------------------------------------------------------------------ доступ

test('владелец — явный OWNER_ID, иначе ADMIN_TELEGRAM_CHAT_ID', () => {
  assert.equal(admin.ownerChatId(), OWNER);
  assert.equal(admin.isOwnerChat(OWNER), true);
  assert.equal(admin.isOwnerChat(STRANGER), false);
  delete process.env.OWNER_ID;
  process.env.ADMIN_TELEGRAM_CHAT_ID = '555';
  try {
    assert.equal(admin.ownerChatId(), '555', 'фолбэк на админский чат не сработал');
    assert.equal(admin.isOwnerChat('555'), true);
  } finally {
    delete process.env.ADMIN_TELEGRAM_CHAT_ID;
  }
  assert.equal(admin.ownerChatId(), null, 'без обоих переменных владелец должен отсутствовать');
  assert.equal(admin.isOwnerChat(OWNER), false, 'без владельца панель открыта всем');
});

test('чужой чат получает «не знаю команду», а не панель', async () => {
  await command(STRANGER, '/admin');
  assert.ok(sent.length > 0, 'ответа нет вообще');
  const last = sent[sent.length - 1]!;
  assert.match(last.text, /Не знаю команду/, 'чужому чату подтвердили панель');
  assert.ok(!last.text.includes('Админ-панель'), 'чужому чату показали панель');
});

test('владелец видит панель с кнопками и без привязки аккаунта', async () => {
  await command(OWNER, '/admin');
  assert.ok(sent.length > 0, 'панель не пришла');
  const last = sent[sent.length - 1]!;
  assert.match(last.text, /Админ-панель/, 'это не панель');
  const kb = last.keyboard as
    | { inline_keyboard: { callback_data?: string }[][] }
    | undefined;
  const datas = kb?.inline_keyboard.flat().map((b) => b.callback_data) ?? [];
  for (const d of ['admin:overview', 'admin:catalog', 'admin:tokens']) {
    assert.ok(datas.includes(d), `нет кнопки ${d}`);
  }
});

// ------------------------------------------------------------------ цифры

test('обзор считает пользователей, тарифы и отклики дня', async () => {
  seedUser({ id: 1, plan: 'pro', chat: '111' });
  seedUser({ id: 2, plan: 'pro' });
  seedUser({ id: 3, plan: 'start', chat: '333' });
  seedSent(1, 4);
  await command(OWNER, '/admin');
  const last = sent[sent.length - 1]!;
  assert.match(last.text, /Пользователи: 3 \(привязано TG: 2\)/, `счётчики не сошлись: ${last.text}`);
  assert.match(last.text, /pro ×2/, 'разбивка по тарифам не сошлась');
  assert.match(last.text, /Откликов сегодня: 4/, 'отклики дня не сошлись');
  assert.match(last.text, /ещё не выполнялись/, 'пустой прогон показан иначе');
  assert.ok(!last.text.includes('@'), 'в панель утекли персональные данные');
  assert.ok(!last.text.includes('example.com'), 'в панель утекли email');
});

test('каталог показывает последний отчёт, пустой — честно', async () => {
  await click(OWNER, 'admin:catalog');
  const empty = edited.length > 0 ? edited[edited.length - 1]! : sent[sent.length - 1]!;
  assert.match(empty.text, /ещё не было/, 'пустой каталог показан иначе');

  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(
    'scheduler:catalog_report',
    JSON.stringify({
      ran: true,
      queries: 2,
      statuses: [
        { source: 'hh', label: 'hh', available: true, count: 5, ok: true },
        { source: 'x', label: 'x', available: true, count: 0, ok: false, error: 'boom' },
      ],
      added: 5,
      durationMs: 4000,
    }),
  );
  await click(OWNER, 'admin:catalog');
  const full = edited[edited.length - 1]!;
  assert.match(full.text, /Запросов: 2/, 'число запросов потеряно');
  assert.match(full.text, /добавлено вакансий: 5/, 'число вакансий потеряно');
  assert.match(full.text, /Источников с ошибкой: 1 из 2/, 'ошибки источников потеряны');
});

// ------------------------------------------------------------------ токены

test('токены: подключённые и мёртвые считаются', async () => {
  seedUser({ id: 1, token: 'live', expires: Date.now() + 3600_000, resume: 'r1' });
  seedUser({ id: 2, token: 'dead', expires: Date.now() - 1000, resume: 'r2' });
  seedUser({ id: 3, token: 'dead-noresume', expires: Date.now() - 1000 });
  await click(OWNER, 'admin:tokens');
  const last = edited[edited.length - 1]!;
  assert.match(last.text, /Подключено аккаунтов: 1 из 3/, `подключённые не сошлись: ${last.text}`);
  assert.match(last.text, /мёртвых.*: 1/, `мёртвые не сошлись: ${last.text}`);
});

test('чужая кнопка панели — тихое «недоступно», без утечки', async () => {
  seedUser({ id: 1, plan: 'pro', chat: STRANGER });
  await click(STRANGER, 'admin:tokens');
  assert.ok(answered.length > 0, 'нажатие не подтверждено');
  assert.equal(answered[answered.length - 1]!.text, 'Недоступно');
  assert.equal(edited.length, 0, 'чужому чату что-то перерисовали');
  assert.ok(
    sent.every((m) => !m.text.includes('Токены')),
    'чужому чату ушёл текст панели',
  );
});
