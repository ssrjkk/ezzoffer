import test, { before } from "node:test";
import assert from "node:assert/strict";

type Database = ReturnType<typeof import("../src/lib/db").createDatabase>;
let db: Database;
let buildStatusText: (userId: number) => string;
let buildDigestText: (userId: number) => string;
let handleTelegramUpdate: (u: import("../src/lib/telegram").TelegramUpdate) => Promise<string | null>;
let escapeTelegramHtml: (value: string) => string;

before(async () => {
  process.env.EZOFFER_DB_PATH = ":memory:";
  process.env.EZOFFER_SILENT = "1";
  delete process.env.TELEGRAM_BOT_TOKEN;
  const dbMod = await import("../src/lib/db");
  db = dbMod.db;
  const tg = await import("../src/lib/telegram");
  buildStatusText = tg.buildStatusText;
  buildDigestText = tg.buildDigestText;
  handleTelegramUpdate = tg.handleTelegramUpdate;
  escapeTelegramHtml = tg.escapeTelegramHtml;
});

function insertUser(over: Record<string, unknown> = {}) {
  return Number(
    db
      .prepare(
        "INSERT INTO users (email, password_hash, plan, plan_expires_at, created_at) VALUES (?,?,?,?,?)",
      )
      .run(over.email ?? `tg-${Math.random().toString(36).slice(2)}@example.com`, "h", "pro", Date.now() + 100000, Date.now())
      .lastInsertRowid,
  );
}

test("buildStatusText формирует отчёт из реальных данных", () => {
  const uid = insertUser();
  const now = Date.now();
  db.prepare(
    "INSERT INTO applications (user_id, job_slug, status, sent_at, withdrawn) VALUES (?, ?, 'sent', ?, 0)",
  ).run(uid, "a", now);
  const text = buildStatusText(uid);
  assert.match(text, /Отправлено: 1/);
});

test("buildDigestText формирует дневной отчёт", () => {
  const uid = insertUser();
  const text = buildDigestText(uid);
  assert.match(text, /Отправлено сегодня: 0/);
});

test("handleTelegramUpdate: /status без подключения предупреждает", async () => {
  const reply = await handleTelegramUpdate({
    message: { chat: { id: 12345 }, text: "/status" },
  });
  assert.ok(reply);
  assert.match(reply!, /не подключён/i);
});

test("handleTelegramUpdate: /link с неверным кодом", async () => {
  const reply = await handleTelegramUpdate({
    message: { chat: { id: 12345 }, text: "/link WRONG" },
  });
  assert.ok(reply);
  assert.match(reply!, /не найден/i);
});

test("handleTelegramUpdate: /start возвращает справку", async () => {
  const reply = await handleTelegramUpdate({
    message: { chat: { id: 12345 }, text: "/start" },
  });
  assert.ok(reply);
  assert.match(reply!, /\/status/);
  assert.match(reply!, /\/searches/);
  assert.match(reply!, /\/pause/);
});

test("handleTelegramUpdate: привязка по коду и /status", async () => {
  const uid = insertUser();
  const code = "TESTCODE1";
  db.prepare("INSERT INTO telegram_codes (user_id, code, expires_at) VALUES (?, ?, ?)").run(
    uid,
    code,
    Date.now() + 60_000,
  );
  const linkReply = await handleTelegramUpdate({
    message: { chat: { id: 999 }, text: `/link ${code}` },
  });
  assert.ok(linkReply);
  assert.match(linkReply!, /подключён/i);
  const linked = db.prepare("SELECT telegram_chat_id FROM users WHERE id = ?").get(uid) as {
    telegram_chat_id: number | string | null;
  };
  assert.equal(linked.telegram_chat_id, "999");
  const statusReply = await handleTelegramUpdate({
    message: { chat: { id: 999 }, text: "/status" },
  });
  assert.ok(statusReply);
  assert.match(statusReply!, /Отправлено:/);
});

test("handleTelegramUpdate: создание поиска и письма + пауза", async () => {
  const uid = insertUser();
  const code = "TESTCODE2";
  db.prepare("INSERT INTO telegram_codes (user_id, code, expires_at) VALUES (?, ?, ?)").run(
    uid,
    code,
    Date.now() + 60_000,
  );
  await handleTelegramUpdate({ message: { chat: { id: 777 }, text: `/link ${code}` } });
  const newSearch = await handleTelegramUpdate({
    message: { chat: { id: 777 }, text: "/new Фронтенд | React, TypeScript" },
  });
  assert.ok(newSearch);
  assert.match(newSearch!, /создан/);
  const searchRow = db
    .prepare("SELECT * FROM searches WHERE user_id = ? AND title = ?")
    .get(uid, "Фронтенд") as { id: number; keywords: string; active: number };
  assert.ok(searchRow);
  assert.match(searchRow.keywords, /React/);
  assert.equal(searchRow.active, 0);

  const newLetter = await handleTelegramUpdate({
    message: { chat: { id: 777 }, text: "/letter Приветствие | Здравствуйте!" },
  });
  assert.ok(newLetter);
  assert.match(newLetter!, /создано/);

  const pauseReply = await handleTelegramUpdate({
    message: { chat: { id: 777 }, text: "/pause" },
  });
  assert.ok(pauseReply);
  assert.match(pauseReply!, /паузу/i);
  const userRow = db.prepare("SELECT autoapply_paused FROM users WHERE id = ?").get(uid) as {
    autoapply_paused: number;
  };
  assert.equal(userRow.autoapply_paused, 1);

  const resumeReply = await handleTelegramUpdate({
    message: { chat: { id: 777 }, text: "/resume" },
  });
  assert.ok(resumeReply);
  assert.match(resumeReply!, /возобновлены/i);
  assert.equal(
    (db.prepare("SELECT autoapply_paused FROM users WHERE id = ?").get(uid) as { autoapply_paused: number })
      .autoapply_paused,
    0,
  );
});

test("escapeTelegramHtml экранирует HTML-символы в пользовательских данных", () => {
  assert.equal(escapeTelegramHtml("A & B <tag> 'x'"), "A &amp; B &lt;tag&gt; 'x'");
});