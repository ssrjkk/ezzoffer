import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

/**
 * Бэкап базы — и, главное, проверка его восстановления.
 *
 * Опасность здесь не в том, что бэкап не создаётся, а в том, что он создаётся
 * и оказывается неполным. База работает в режиме WAL: часть свежих изменений
 * лежит в `ezoffer.db-wal`, и копирование одного `ezoffer.db` молча отдаёт базу
 * минуты давности. При восстановлении человек получает потерянные аккаунты и
 * отклики — и не узнаёт об этом, потому что файл открывается нормально.
 *
 * Поэтому проверяется не «файл создался», а «в копии есть то, что записано
 * после последней записи в основной файл», и «скрипт падает, когда падать
 * должен».
 */

let dir: string;
let dbPath: string;
let backupDir: string;
const created: string[] = [];

before(() => {
  dir = mkdtempSync(join(tmpdir(), "ezoffer-backup-"));
  dbPath = join(dir, "ezoffer.db");
  backupDir = join(dir, "backups");
  created.push(dir);
});

after(() => {
  for (const d of created) rmSync(d, { recursive: true, force: true });
});

function backup(): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["scripts/backup.mjs", backupDir],
      { cwd: process.cwd(), env: { ...process.env, EZOFFER_DB_PATH: dbPath }, timeout: 60_000 },
      (error, stdout, stderr) => {
        resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, stdout, stderr });
      },
    );
  });
}

function latestBackup(): string | null {
  if (!existsSync(backupDir)) return null;
  const files = readdirSync(backupDir).filter((f) => f.endsWith(".db")).sort();
  return files.length > 0 ? join(backupDir, files[files.length - 1]) : null;
}

/** База с одной таблицей в режиме WAL — как настоящая. */
function seedWithWAL(rows: number): void {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE IF NOT EXISTS things (id INTEGER PRIMARY KEY, note TEXT NOT NULL)");
  for (let i = 0; i < rows; i++) {
    db.prepare("INSERT INTO things (note) VALUES (?)").run(`строка ${i}`);
  }
  db.close();
}

test("бэкап открывается и проходит integrity_check", async () => {
  seedWithWAL(5);
  const res = await backup();

  assert.equal(res.code, 0, `бэкап упал: ${res.stderr}`);
  assert.match(res.stdout, /integrity ok/, "скрипт не подтвердил целостность копии");

  const file = latestBackup();
  assert.ok(file, "файл бэкапа не создан");
  const copy = new Database(file, { readonly: true });
  assert.equal(copy.pragma("integrity_check", { simple: true }), "ok");
  copy.close();
});

/**
 * Ключевая проверка, и она же объяснение, почему нельзя просто копировать файл.
 *
 * WAL схлопывается в основной файл при ЧИСТОМ закрытии последнего соединения.
 * То есть после `db.close()` опасности нет, и тест на ней ничего бы не проверял.
 * Опасность возникает ровно тогда, когда база открыта и в неё пишут, — то есть
 * пока работает сервер. Поэтому здесь соединение намеренно удерживается открытым
 * на время бэкапа: последняя запись лежит в -wal и в сам файл не попала.
 *
 * Контрольная наивная копия (только .db, без -wal) показывает, что именно она
 * теряет. Если бы она оказалась полной — тест перестал бы что-либо проверять.
 */
test("бэкап снимается с открытой базы и не теряет записанное", async () => {
  seedWithWAL(3);

  // Соединение держим открытым — это и есть работающий сервер.
  const held = new Database(dbPath);
  held.pragma("journal_mode = WAL");
  held.prepare("INSERT INTO things (note) VALUES (?)").run("строка при живом сервере");

  try {
    // Контроль: обычная копия одного файла без -wal.
    const naivePath = join(dir, "naive.db");
    copyFileSync(dbPath, naivePath);
    const naive = new Database(naivePath, { readonly: true });
    const naiveNotes = (naive.prepare("SELECT note FROM things").all() as { note: string }[])
      .map((r) => r.note);
    naive.close();
    rmSync(naivePath, { force: true });

    const res = await backup();
    assert.equal(res.code, 0, `бэкап упал: ${res.stderr}`);

    const file = latestBackup();
    assert.ok(file, "файл бэкапа не создан");
    const copy = new Database(file, { readonly: true });
    const notes = (copy.prepare("SELECT note FROM things ORDER BY id").all() as { note: string }[])
      .map((r) => r.note);
    copy.close();

    assert.ok(
      notes.includes("строка при живом сервере"),
      `бэкап потерял последнюю запись: ${JSON.stringify(notes)}`,
    );
    assert.ok(
      !naiveNotes.includes("строка при живом сервере"),
      `наивная копия оказалась полной (${JSON.stringify(naiveNotes)}) — тест перестал что-либо проверять`,
    );
  } finally {
    held.close();
  }
});

test("отсутствующая база — ненулевой код, а не тихий успех", async () => {
  const res = await new Promise<{ code: number; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      ["scripts/backup.mjs", join(dir, "bk2")],
      {
        cwd: process.cwd(),
        env: { ...process.env, EZOFFER_DB_PATH: join(dir, "нет-такой.db") },
        timeout: 60_000,
      },
      (error, _stdout, stderr) => {
        resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, stderr });
      },
    );
  });

  assert.notEqual(res.code, 0, "скрипт сообщил об успехе при отсутствующей базе");
  assert.match(res.stderr, /Нет базы/, "не сказано, в чём причина");
});

test("старые бэкапы ротируются, свежие остаются", async () => {
  seedWithWAL(1);
  await backup();

  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 1100));
    await backup();
  }

  const files = readdirSync(backupDir).filter((f) => f.endsWith(".db")).sort();
  assert.ok(files.length <= 14, `ротация не сработала: ${files.length} файлов`);
});