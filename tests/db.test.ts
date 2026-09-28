import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../src/lib/db";

function insertUser(db: ReturnType<typeof createDatabase>, email: string, plan = "trial") {
  return db
    .prepare(
      "INSERT INTO users (email, password_hash, plan, plan_expires_at, created_at) VALUES (?,?,?,?,?)",
    )
    .run(email, "hash", plan, null, Date.now());
}

test("createDatabase(':memory:') создаёт схему и пользователя", () => {
  const db = createDatabase(":memory:");
  const r = insertUser(db, "u@example.com");
  assert.equal(r.changes, 1);
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(r.lastInsertRowid);
  assert.equal((row as { email: string }).email, "u@example.com");
});

test("email уникален (UNIQUE constraint)", () => {
  const db = createDatabase(":memory:");
  insertUser(db, "dup@example.com");
  assert.throws(() => insertUser(db, "dup@example.com"), /UNIQUE/i);
});

test("FK enforced: sessions.user_id должен существовать", () => {
  const db = createDatabase(":memory:");
  // Нет пользователя с id=999 → сессия должна быть отклонена по FK
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)")
        .run("tok", 999, Date.now()),
    /FOREIGN KEY|CONSTRAINT/i,
  );
});

test("WAL включается только для файловых БД", () => {
  const mem = createDatabase(":memory:");
  assert.equal(mem.pragma("journal_mode", { simple: true }), "memory");
});