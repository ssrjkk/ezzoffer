import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDatabase } from "../src/lib/db";
import { acquireLock, lockHeldAt, releaseLock } from "../src/lib/scheduler";

const LOCK_TTL_MS = 30 * 60 * 1000;

test("первый захват блокировки проходит, когда метки нет", () => {
  const db = createDatabase(":memory:");
  assert.equal(lockHeldAt(db), 0, "метки изначально нет");
  assert.equal(acquireLock(db, 1_000_000), true, "первый запуск не должен блокироваться");
  assert.equal(lockHeldAt(db), 1_000_000, "метка должна быть записана");
});

test("второй захват до истечения TTL блокируется", () => {
  const db = createDatabase(":memory:");
  const now = 1_000_000;
  assert.equal(acquireLock(db, now), true);
  assert.equal(acquireLock(db, now + 1000), false, "перекрытие не должно проходить");
});

test("после истечения TTL блокировка снова доступна", () => {
  const db = createDatabase(":memory:");
  const now = 1_000_000;
  acquireLock(db, now);
  assert.equal(acquireLock(db, now + LOCK_TTL_MS + 1), true);
});

test("releaseLock освобождает блокировку для следующего тика", () => {
  const db = createDatabase(":memory:");
  const now = 1_000_000;
  acquireLock(db, now);
  releaseLock(db);
  assert.equal(lockHeldAt(db), 0, "метка должна быть снята");
  assert.equal(acquireLock(db, now + 1000), true, "снятая блокировка не должна мешать");
});

test("устаревшая метка не блокирует новый запуск (TTL вместо вечной блокировки)", () => {
  const db = createDatabase(":memory:");
  const now = 1_000_000;
  acquireLock(db, now);
  assert.equal(acquireLock(db, now + LOCK_TTL_MS * 2), true);
});

test("блокировка видна другому процессу через файл БД", () => {
  const dir = join(tmpdir(), `ezoffer-lock-${process.pid}-${Date.now()}`);
  const file = join(dir, "ezoffer.db");
  try {
    const first = createDatabase(file);
    acquireLock(first, 2_000_000);
    first.close();

    const second = createDatabase(file);
    assert.equal(lockHeldAt(second), 2_000_000, "метка сохраняется в файле");
    assert.equal(acquireLock(second, 2_000_500), false, "новый процесс видит чужую блокировку");
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("последовательные тики: захват и сброс повторяются без залипания", () => {
  const db = createDatabase(":memory:");
  let now = 5_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(acquireLock(db, now), true, `тик ${i} должен захватить блокировку`);
    releaseLock(db);
    assert.equal(lockHeldAt(db), 0, `после тика ${i} метка снята`);
    now += 60_000;
  }
});
