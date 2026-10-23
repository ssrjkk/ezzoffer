import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Входящая очередь Telegram: вебхук складывает, тик разбирает.
 *
 * Раньше handleUpdate выполнялся прямо в вебхуке: долгий ответ приводил
 * к ретраям Telegram. Дедупликацию при этом делали три разных механизма
 * (in-memory Set, копия в meta, отметка в tg_updates), расходящиеся по краям.
 * Теперь арбитр один — первичный ключ tg_inbox.
 */

const SECRET = 'tg-webhook-test-secret';

let db: ReturnType<typeof import('../src/lib/db').createDatabase>;
let bodies: { chat_id?: string; text?: string }[];

function hook(body: unknown): Request {
  return new Request('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': SECRET,
    },
    body: JSON.stringify(body),
  });
}

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  /*
   * Быстрый разбор (wakeInbox) по умолчанию включён — а эти тесты проверяют
   * именно разделение «вебхук складывает, тик разбирает», поэтому здесь он
   * выключен. Сам fast-path проверяется отдельным тестом ниже.
   */
  process.env.TELEGRAM_FAST_PATH = '0';
  db = (await import('../src/lib/db')).db;
  bodies = [];
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body ?? '{}')) as { chat_id?: string; text?: string };
    bodies.push(parsed);
    return { ok: true, status: 200, text: async () => '{"ok":true}' } as unknown as Response;
  }) as typeof fetch;
});

beforeEach(() => {
  db.exec('DELETE FROM tg_inbox; DELETE FROM meta;');
  bodies!.length = 0;
});

test('вебхук складывает апдейт и отвечает 200 без обработки', async () => {
  const { POST } = await import('../src/app/api/telegram/webhook/route');
  const res = await POST(hook({ update_id: 9001, message: { chat: { id: 5 }, text: '/start' } }));
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT update_id, done_at FROM tg_inbox').get() as
    | { update_id: number; done_at: number | null }
    | undefined;
  assert.ok(row, 'апдейт не попал в очередь');
  assert.equal(row.done_at, null, 'вебхук не должен разбирать: только сложить');
  assert.equal(bodies!.length, 0, 'вебхук отправил ответ пользователю сам');
});

test('повторный update_id отклоняется ключом', async () => {
  const { POST } = await import('../src/app/api/telegram/webhook/route');
  const upd = { update_id: 9002, message: { chat: { id: 5 }, text: '/start' } };
  assert.equal((await POST(hook(upd))).status, 200);
  const dup = await POST(hook(upd));
  assert.equal(dup.status, 200);
  assert.equal(
    ((await dup.json()) as { duplicate?: boolean }).duplicate,
    true,
    'дубликат не помечен',
  );
  const count = db.prepare('SELECT COUNT(*) AS c FROM tg_inbox').get() as { c: number };
  assert.equal(count.c, 1, 'дубликат создал вторую строку');
});

test('мусор без update_id игнорируется', async () => {
  const { POST } = await import('../src/app/api/telegram/webhook/route');
  const res = await POST(hook({ message: { text: '?' } }));
  assert.equal(res.status, 200);
  const count = db.prepare('SELECT COUNT(*) AS c FROM tg_inbox').get() as { c: number };
  assert.equal(count.c, 0, 'мусор записан в очередь');
});

test('processInbox разбирает очередь и помечает выполненное', async () => {
  const { POST } = await import('../src/app/api/telegram/webhook/route');
  const { processInbox } = await import('../src/lib/telegram-bot');
  await POST(hook({ update_id: 9003, message: { chat: { id: 5 }, text: '/start' } }));

  const r = await processInbox();
  assert.equal(r.processed, 1, `не разобрано: ${JSON.stringify(r)}`);
  assert.equal(bodies!.length, 1, 'ответ пользователю не отправлен');
  assert.match(bodies![0]!.text ?? '', /Привет/, 'ответ не похож на /start');

  const row = db.prepare('SELECT done_at FROM tg_inbox WHERE update_id = 9003').get() as {
    done_at: number | null;
  };
  assert.ok(row.done_at, 'строка не помечена выполненной — будет повтор');

  // Повторный разбор той же очереди ничего не делает.
  const r2 = await processInbox();
  assert.deepEqual(r2, { processed: 0, failed: 0 }, 'обработанное разобрано снова');
});

test('битый JSON в очереди не роняет разборщик', async () => {
  const { processInbox } = await import('../src/lib/telegram-bot');
  db.prepare('INSERT INTO tg_inbox (update_id, body, received_at) VALUES (?, ?, ?)').run(
    9004,
    'not-json{{{',
    Date.now(),
  );
  const r = await processInbox();
  assert.equal(r.failed, 1);
  const row = db.prepare('SELECT done_at FROM tg_inbox WHERE update_id = 9004').get() as {
    done_at: number | null;
  };
  assert.ok(row.done_at, 'битая строка осталась висеть в очереди навсегда');
});

test('fast-path: вебхук разбирает очередь следом за ответом', async () => {
  /*
   * Метрика — латентность ответа бота: без fast-path она равна интервалу тика
   * (минуты), с ним — секундам. Флаг включается только на этот тест: остальные
   * проверяют разделение «вебхук складывает, тик разбирает».
   */
  process.env.TELEGRAM_FAST_PATH = '1';
  try {
    const { POST } = await import('../src/app/api/telegram/webhook/route');
    const res = await POST(hook({ update_id: 9005, message: { chat: { id: 5 }, text: '/start' } }));
    assert.equal(res.status, 200);
    const deadline = Date.now() + 5000;
    let done: number | null = null;
    while (Date.now() < deadline) {
      const row = db.prepare('SELECT done_at FROM tg_inbox WHERE update_id = 9005').get() as {
        done_at: number | null;
      };
      if (row?.done_at) {
        done = row.done_at;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(done, 'очередь не разобрана за 5с после ответа 200');
    assert.equal(bodies!.length, 1, 'ответ пользователю не отправлен');
  } finally {
    process.env.TELEGRAM_FAST_PATH = '0';
  }
});

test('два processInbox в одну мс не разбирают строку дважды', async () => {
  /*
   * wakeInbox из вебхука + тик планировщика в одну миллисекунду ставили
   * одинаковый claimed_at, и второй SELECT забирал строки первого: команда
   * выполнялась дважды, /подбор слал дубли. Замороженные часы делают гонку
   * детерминированной: на старом коде второй разбор забирал бы ту же строку.
   */
  const realNow = Date.now;
  Date.now = () => 1_700_000_000_000;
  try {
    const { POST } = await import('../src/app/api/telegram/webhook/route');
    const { processInbox } = await import('../src/lib/telegram-bot');
    await POST(hook({ update_id: 9011, message: { chat: { id: 5 }, text: '/start' } }));
    const [a, b] = await Promise.all([processInbox(), processInbox()]);
    assert.equal(a.processed + b.processed, 1, `двойной разбор: ${JSON.stringify([a, b])}`);
    assert.equal(bodies!.length, 1, `ответ отправлен дважды: ${bodies!.length}`);
  } finally {
    Date.now = realNow;
  }
});

test('брошенный claim подбирается по TTL, а не висит вечно', async () => {
  /*
   * kill -9 между claim и finish оставлял claimed_at навсегда: выборка видела
   * только NULL, и команда терялась молча — бот «не отвечал» без ошибок.
   */
  const { POST } = await import('../src/app/api/telegram/webhook/route');
  const { processInbox } = await import('../src/lib/telegram-bot');
  await POST(hook({ update_id: 9012, message: { chat: { id: 5 }, text: '/start' } }));
  db.prepare('UPDATE tg_inbox SET claimed_at = ? WHERE update_id = 9012').run(1);
  const r = await processInbox();
  assert.equal(r.processed, 1, 'протухший claim не подобран');
  assert.equal(bodies!.length, 1, 'ответ по подобранной заявке не отправлен');
});

test('вечный неуспех отправки закрывается после лимита попыток', async () => {
  /*
   * Раньше неудачная отправка (res === false) отпускала заявку без счёта:
   * вечный 400 («chat not found», заблокировавший бота) крутил отправку
   * каждый тик бесконечно — лишний трафик и мусор в логе.
   */
  const saved = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: false,
    status: 400,
    text: async () => '{"ok":false,"description":"Bad Request: chat not found"}',
  })) as unknown as typeof globalThis.fetch;
  try {
    const { POST } = await import('../src/app/api/telegram/webhook/route');
    const { processInbox } = await import('../src/lib/telegram-bot');
    await POST(hook({ update_id: 9006, message: { chat: { id: 5 }, text: '/start' } }));
    for (let i = 0; i < 6; i++) await processInbox();
    const row = db.prepare('SELECT done_at, attempts FROM tg_inbox WHERE update_id = 9006').get() as {
      done_at: number | null;
      attempts: number;
    };
    assert.ok(row.done_at, 'строка с вечным неуспехом крутится бесконечно');
    assert.ok(row.attempts >= 5, `попытки не считались: ${row.attempts}`);
  } finally {
    globalThis.fetch = saved;
  }
});
