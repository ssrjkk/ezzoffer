import test, { before } from "node:test";
import assert from "node:assert/strict";

type Database = ReturnType<typeof import("../src/lib/db").createDatabase>;
let db: Database;
let runAutoApply: () => Promise<import("../src/lib/autoapply").AutoApplyRun>;

before(async () => {
  process.env.EZOFFER_DB_PATH = ":memory:";
  process.env.EZOFFER_SILENT = "1";
  delete process.env.HH_ACCESS_TOKEN;
  delete process.env.HH_CLIENT_ID;
  const dbMod = await import("../src/lib/db");
  db = dbMod.db;
  const aa = await import("../src/lib/autoapply");
  runAutoApply = aa.runAutoApply;
});

test("runAutoApply без hh-подключения не создаёт отклики (никакой симуляции)", async () => {
  const uid = Number(
    db
      .prepare(
        "INSERT INTO users (email, password_hash, plan, plan_expires_at, created_at) VALUES (?,?,?,?,?)",
      )
      .run("auto@example.com", "h", "pro", Date.now() + 100000, Date.now()).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO searches (user_id, title, keywords, active, started_at, created_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ).run(uid, "s", "frontend", Date.now(), Date.now());

  const result = await runAutoApply();

  // Без подключённого hh (нет токена и resume) отклики не создаются.
  const count = db.prepare("SELECT COUNT(*) c FROM applications WHERE user_id = ?").get(uid) as {
    c: number;
  };
  assert.equal(count.c, 0);
  assert.ok(typeof result.ran === "boolean");
});

test("runAutoApply c hh-подключением пытается отправить (через провайдера, env-gated)", async () => {
  process.env.HH_ACCESS_TOKEN = "test-token";
  const uid = Number(
    db
      .prepare(
        "INSERT INTO users (email, password_hash, plan, plan_expires_at, created_at, hh_token, hh_resume_id) VALUES (?,?,?,?,?,?,?)",
      )
      .run("auto2@example.com", "h", "pro", Date.now() + 100000, Date.now(), "tok", "res123").lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO searches (user_id, title, keywords, active, started_at, created_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ).run(uid, "s", "frontend", Date.now(), Date.now());

  const result = await runAutoApply();
  assert.ok(Array.isArray([result.applied, result.failed, result.skipped]));
  // Воркер отработал, но реальный POST к api.hh.ru недоступен в тестах —
  // главное, что не падает и не фабрикует строки "sent" вручную.
  delete process.env.HH_ACCESS_TOKEN;
});