import { db, type User } from "./db";
import { isPlanActive, planDailyLimit } from "./plans";
import { matchesSearch, type SearchRow } from "./matcher";
import { getCatalog } from "./vacancies";
import { hhProvider } from "./vacancies/hh";
import { getValidHhToken } from "./hh-oauth";
import { createPacing, zeroPacing, type PacingConfig } from "./anti-ban";
import { effectivePacing } from "./config";
import { logError, logInfo } from "./logger";

/**
 * Реальный автоотклик: для каждого активного поиска находит подходящие вакансии
 * в каталоге и отправляет отклики через hh.ru API от имени пользователя.
 * Паузы и лимиты контролирует анти-бан паузер (createPacing).
 * Строка applications создаётся только при успешной реальной отправке (POST /negotiations).
 * Уважает: паузу пользователя (autoapply_paused) и глобальные мягкие лимиты из env.
 */

export type AutoApplyRun = {
  ran: boolean;
  reason?: string;
  searches: number;
  applied: number;
  failed: number;
  skipped: number;
  pausedFor: string | null;
  pausedUsers: number;
};

function todayCount(userId: number): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const row = db
    .prepare(
      "SELECT COUNT(*) AS c FROM applications WHERE user_id = ? AND sent_at >= ? AND withdrawn = 0",
    )
    .get(userId, start.getTime()) as { c: number };
  return row.c;
}

function getActiveSearches(userId: number): SearchRow[] {
  return db
    .prepare("SELECT * FROM searches WHERE user_id = ? AND active = 1")
    .all(userId) as SearchRow[];
}

export async function runAutoApply(opts?: { pacing?: Partial<PacingConfig> }): Promise<AutoApplyRun> {
  const users = db.prepare("SELECT * FROM users").all() as User[];
  let searches = 0;
  let applied = 0;
  let failed = 0;
  let skipped = 0;
  let ran = false;
  let pausedFor: string | null = null;
  let pausedUsers = 0;

  for (const user of users) {
    if (!isPlanActive(user)) continue;
    const limit = planDailyLimit(user.plan);
    if (limit <= 0) continue;

    // Пользователь поставил автоотклики на паузу.
    if (user.autoapply_paused) {
      pausedUsers++;
      continue;
    }

    const activeSearches = getActiveSearches(user.id);
    if (activeSearches.length === 0) continue;
    ran = true;

    const used = todayCount(user.id);
    const remaining = Math.max(0, limit - used);
    if (remaining <= 0) continue;

    // Анти-бан: суточный лимит = остаток от тарифа (с учётом глобального потолка),
    // часовой лимит и паузы — из конфигурации.
    const base = effectivePacing(limit);
    const pacing = opts?.pacing
      ? createPacing({ ...opts.pacing, dailyLimit: Math.min(remaining, base.dailyCap) }, () => Date.now())
      : zeroPacing();

    const appliedSet = new Set<string>();
    const resumeId = user.hh_resume_id?.trim();
    // Актуальный токен пользователя (с авто-обновлением протухшего).
    const valid = resumeId ? await getValidHhToken(user) : null;
    const token = valid?.token ?? null;

    for (const search of activeSearches) {
      if (appliedSet.size >= remaining) break;
      searches++;

      const candidates = getCatalog().filter(
        (v) => v.source === "hh" && matchesSearch(v, search) && !appliedSet.has(v.slug),
      );
      if (candidates.length === 0) continue;

      for (const vacancy of candidates) {
        if (appliedSet.size >= remaining) break;
        if (!hhProvider.isAvailable()) break;
        if (!token || !resumeId) {
          skipped += candidates.length;
          break;
        }

        const decision = pacing.decide();
        if (!decision.allowed) {
          pausedFor = decision.reason;
          // В режиме реального планировщика просто останавливаемся до следующего тика.
          if (decision.reason !== "night" || decision.retryAfterMs <= 0) break;
        }

        const already = db
          .prepare("SELECT id FROM applications WHERE user_id = ? AND job_slug = ? AND withdrawn = 0")
          .get(user.id, vacancy.slug);
        if (already) continue;

        if (!hhProvider.apply) break;
        const result = await hhProvider.apply(vacancy, {
          resumeId,
          message: undefined,
          accessToken: token,
        });
        if (!result.ok) {
          failed++;
          pacing.recordFailure("platform");
          logError("autoapply", new Error(result.error ?? "apply failed"), {
            userId: user.id,
            slug: vacancy.slug,
          });
          continue;
        }

        pacing.recordSent();
        const now = Date.now();
        db.prepare(
          `INSERT INTO applications (user_id, job_slug, search_id, resume_id, status, sent_at)
           VALUES (?, ?, ?, ?, 'sent', ?)`,
        ).run(user.id, vacancy.slug, search.id, user.hh_resume_id ?? null, now);
        appliedSet.add(vacancy.slug);
        applied++;
      }
    }

    if (appliedSet.size > 0) {
      logInfo("autoapply", `отправлено откликов: ${appliedSet.size}`, { userId: user.id });
    }
  }

  if (!ran) {
    return {
      ran: false,
      reason: "нет активных поисков у пользователей с активным тарифом",
      searches,
      applied,
      failed,
      skipped,
      pausedFor,
      pausedUsers,
    };
  }
  return { ran: true, searches, applied, failed, skipped, pausedFor, pausedUsers };
}