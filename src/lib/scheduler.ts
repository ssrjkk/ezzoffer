import type BetterSqlite3 from "better-sqlite3";
import { db } from "./db";
import { refreshProviders } from "./vacancies";
import { runAutoApply } from "./autoapply";
import { syncAllHhUsers } from "./hh-sync";
import { logError, logInfo } from "./logger";
import { envNum } from "./env";

/**
 * Центральный планировщик реальных фоновых задач (однопоточный, с блокировкой от перекрытия):
 *  1. Обновление каталога вакансий (если устарел);
 *  2. Автоотклики через анти-бан паузер;
 *  3. Синхронизация статусов с hh.ru.
 */

const LOCK_KEY = "scheduler:lock";
const CATALOG_REFRESH_KEY = "scheduler:catalog_refresh";
const LOCK_TTL_MS = 30 * 60 * 1000;

type MetaStore = Pick<BetterSqlite3.Database, "prepare">;

function getMeta(instance: MetaStore, key: string): string | null {
  const row = instance.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setMeta(instance: MetaStore, key: string, value: string): void {
  instance
    .prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

/**
 * Блокировка от перекрытия прогонов планировщика.
 *
 * Метка хранится в таблице meta и должна сниматься вызывающим кодом. Если
 * предыдущий запуск упал и не снял её, новый ждёт TTL — иначе после рестарта
 * два процесса работали бы одновременно.
 *
 * Регрессия: проверка была `if (now - lockAt < TTL) return` сразу после
 * записи метки, из-за чего текущий же прогон выходил, думая, что метка
 * принадлежит другому. Здесь явная проверка `held > 0` отличает «метки нет»
 * от «метка только что поставлена».
 */
export function acquireLock(instance: MetaStore, now: number, ttlMs = LOCK_TTL_MS): boolean {
  const held = Number(getMeta(instance, LOCK_KEY) ?? 0);
  if (held > 0 && now - held < ttlMs) return false;
  setMeta(instance, LOCK_KEY, String(now));
  return true;
}

/** Снимает блокировку, чтобы следующий тик мог запуститься. */
export function releaseLock(instance: MetaStore): void {
  instance.prepare("DELETE FROM meta WHERE key = ?").run(LOCK_KEY);
}

/** Метка времени текущего владельца блокировки; 0 — блокировка свободна. */
export function lockHeldAt(instance: MetaStore): number {
  return Number(getMeta(instance, LOCK_KEY) ?? 0);
}

async function refreshCatalogIfStale(now: number): Promise<void> {
  const last = Number(getMeta(db, CATALOG_REFRESH_KEY) ?? 0);
  // envNum, а не Number(process.env.X ?? default): Number("") === 0, из-за чего
  // пустая переменная в .env.example делала каталог «просроченным» всегда —
  // провайдеры дёргались на каждом тике вместо раза в 6 часов.
  const ttlMs = envNum(process.env, "CATALOG_TTL_MS", 6 * 60 * 60 * 1000, { min: 60_000 });
  if (now - last < ttlMs) return;
  try {
    await refreshProviders({ limit: 50 });
    setMeta(db, CATALOG_REFRESH_KEY, String(now));
    logInfo("scheduler", "каталог обновлён");
  } catch (err) {
    logError("scheduler:refresh", err);
  }
}

export async function runScheduledJobs(): Promise<void> {
  const now = Date.now();
  if (!acquireLock(db, now)) return;

  try {
    await refreshCatalogIfStale(now);
    await runAutoApply();
    await syncAllHhUsers();
  } catch (err) {
    logError("scheduler", err);
  } finally {
    releaseLock(db);
  }
}