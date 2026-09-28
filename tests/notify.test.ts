import test, { before } from "node:test";
import assert from "node:assert/strict";

type Database = ReturnType<typeof import("../src/lib/db").createDatabase>;
let db: Database;
let collectDigest: (userId: number) => import("../src/lib/notify").DigestData;

before(async () => {
  process.env.EZOFFER_DB_PATH = ":memory:";
  process.env.EZOFFER_SILENT = "1";
  const dbMod = await import("../src/lib/db");
  db = dbMod.db;
  const n = await import("../src/lib/notify");
  collectDigest = n.collectDigest;
});

test("collectDigest считает реальные цифры из БД", () => {
  const uid = Number(
    db
      .prepare(
        "INSERT INTO users (email, password_hash, plan, plan_expires_at, created_at) VALUES (?,?,?,?,?)",
      )
      .run("digest@example.com", "h", "pro", Date.now() + 100000, Date.now()).lastInsertRowid,
  );
  const now = Date.now();
  const ins = db.prepare(
    `INSERT INTO applications (user_id, job_slug, status, response, response_note, sent_at, viewed_at, responded_at, withdrawn)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  );
  ins.run(uid, "a", "sent", "", "", now, null, null);
  ins.run(uid, "b", "viewed", "", "", now, now - 1000, null);
  ins.run(uid, "c", "responded", "interview", "Приглашение", now, now - 1000, now - 500);
  db.prepare(
    "INSERT INTO searches (user_id, title, active, created_at) VALUES (?, ?, 1, ?)",
  ).run(uid, "s", now);

  const d = collectDigest(uid);
  assert.equal(d.sentToday, 3);
  assert.equal(d.viewed, 2);
  assert.equal(d.responded, 1);
  assert.equal(d.invited, 1);
  assert.equal(d.activeSearches, 1);
  assert.equal(d.newResponses.length, 1);
  assert.equal(d.newResponses[0].response, "interview");
});

test("collectDigest без данных возвращает нули", () => {
  const uid = Number(
    db
      .prepare(
        "INSERT INTO users (email, password_hash, plan, plan_expires_at, created_at) VALUES (?,?,?,?,?)",
      )
      .run("digest2@example.com", "h", "pro", Date.now() + 100000, Date.now()).lastInsertRowid,
  );
  const d = collectDigest(uid);
  assert.equal(d.sentToday, 0);
  assert.equal(d.viewed, 0);
  assert.equal(d.responded, 0);
  assert.equal(d.invited, 0);
  assert.equal(d.activeSearches, 0);
  assert.equal(d.newResponses.length, 0);
});