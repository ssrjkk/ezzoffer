import { db } from "./db";
import { refreshProviders } from "./vacancies";
import { runAutoApply } from "./autoapply";
import { syncAllHhUsers } from "./hh-sync";
import { sendDigestEmail, smtpConfigured } from "./notify";
import { sendDigestToUser, telegramConfigured } from "./telegram";
import { isPlanActive } from "./plans";
import type { User } from "./db";
import { logError, logInfo } from "./logger";
import { startBackupScheduler } from "./backup";

/**
 * Центральный планировщик реальных фоновых задач (однопоточный, с блокировкой от перекрытия):
 *  1. Обновление каталога вакансий (если устарел);
 *  2. Автоотклики через анти-бан паузер;
 *  3. Синхронизация статусов с hh.ru;
 *  4. Дневные отчёты (email + Telegram) — раз в сутки на пользователя.
 */

const LOCK_KEY = "scheduler:lock";
const CATALOG_REFRESH_KEY = "scheduler:catalog_refresh";
const DIGEST_DAY_KEY = "scheduler:digest_day";

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

async function runDigests(now: number): Promise<void> {
  if (!smtpConfigured() && !telegramConfigured()) return;
  const dayKey = Math.floor(now / (24 * 60 * 60 * 1000));
  if (getMeta(DIGEST_DAY_KEY) === String(dayKey)) return;

  const users = db.prepare("SELECT * FROM users").all() as User[];
  let sent = 0;
  for (const user of users) {
    if (!isPlanActive(user)) continue;
    const emailOk = await sendDigestEmail(user.id);
    const tgOk = telegramConfigured() ? await sendDigestToUser(user.id) : false;
    if (emailOk || tgOk) sent++;
  }
  setMeta(DIGEST_DAY_KEY, String(dayKey));
  if (sent > 0) logInfo("scheduler", `отчётов отправлено: ${sent}`);
}

export async function runScheduledJobs(): Promise<void> {
  const now = Date.now();
  const lockAt = Number(getMeta(LOCK_KEY) ?? 0);
  if (now - lockAt < 30 * 60 * 1000) return;
  setMeta(LOCK_KEY, String(now));

  try {
    startBackupScheduler();
    await refreshCatalogIfStale(now);
    await runAutoApply();
    await syncAllHhUsers();
    await runDigests(now);
  } catch (err) {
    logError("scheduler", err);
  } finally {
    db.prepare("DELETE FROM meta WHERE key = ?").run(LOCK_KEY);
  }
}