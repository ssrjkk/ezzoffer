import { db } from "./db";
import { refreshProviders } from "./vacancies";
import { runAutoApply } from "./autoapply";
import { syncAllHhUsers } from "./hh-sync";
import { logError, logInfo } from "./logger";

/**
 * Центральный планировщик реальных фоновых задач (однопоточный, с блокировкой от перекрытия):
 *  1. Обновление каталога вакансий (если устарел);
 *  2. Автоотклики через анти-бан паузер;
 *  3. Синхронизация статусов с hh.ru.
 */

const LOCK_KEY = "scheduler:lock";
const CATALOG_REFRESH_KEY = "scheduler:catalog_refresh";

function getMeta(key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setMeta(key: string, value: string): void {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

async function refreshCatalogIfStale(now: number): Promise<void> {
  const last = Number(getMeta(CATALOG_REFRESH_KEY) ?? 0);
  const ttlMs = Number(process.env.CATALOG_TTL_MS ?? 6 * 60 * 60 * 1000);
  if (now - last < ttlMs) return;
  try {
    await refreshProviders({ limit: 50 });
    setMeta(CATALOG_REFRESH_KEY, String(now));
    logInfo("scheduler", "каталог обновлён");
  } catch (err) {
    logError("scheduler:refresh", err);
  }
}

export async function runScheduledJobs(): Promise<void> {
  const now = Date.now();
  const lockAt = Number(getMeta(LOCK_KEY) ?? 0);
  if (now - lockAt < 30 * 60 * 1000) return;
  setMeta(LOCK_KEY, String(now));

  try {
    await refreshCatalogIfStale(now);
    await runAutoApply();
    await syncAllHhUsers();
  } catch (err) {
    logError("scheduler", err);
  } finally {
    db.prepare("DELETE FROM meta WHERE key = ?").run(LOCK_KEY);
  }
}