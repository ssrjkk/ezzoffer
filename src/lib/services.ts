import { db, type User } from "./db";
import { isPlanActive, planDailyLimit } from "./plans";
import { getVacancyBySlug, getCatalog } from "./vacancies";
import { matchesSearch, type SearchRow } from "./matcher";
import { personalizeLetter } from "./cover-letter";
import { listApplications } from "./applications";
import { getStats } from "./stats";

/**
 * Общий сервисный слой: операции, которые выполняются и с сайта (API-роуты),
 * и из Telegram-бота. Единая бизнес-логика без дублирования.
 */

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

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

export function listUserSearches(userId: number): SearchRow[] {
  return db
    .prepare("SELECT * FROM searches WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as SearchRow[];
}

export function createSearch(userId: number, input: {
  title?: string;
  keywords?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  format?: string;
  city?: string;
  level?: string;
  company_blacklist?: string;
}): ServiceResult<SearchRow> {
  const title = (input.title?.trim() || "Новый поиск").slice(0, 100);
  const keywords = (input.keywords?.trim() ?? "").slice(0, 400);
  const format = (input.format?.trim() ?? "").slice(0, 20);
  const city = (input.city?.trim() ?? "").slice(0, 60);
  const level = (input.level?.trim() ?? "").slice(0, 20);
  const blacklist = (input.company_blacklist?.trim() ?? "").slice(0, 400);

  const salaryMin = input.salary_min != null && Number.isFinite(input.salary_min) && input.salary_min > 0
    ? Math.floor(input.salary_min)
    : null;
  const salaryMax = input.salary_max != null && Number.isFinite(input.salary_max) && input.salary_max > 0
    ? Math.floor(input.salary_max)
    : null;
  if (salaryMin != null && salaryMax != null && salaryMin > salaryMax) {
    return { ok: false, error: "Минимальная зарплата не может быть больше максимальной" };
  }

  const result = db
    .prepare(
      `INSERT INTO searches (user_id, title, keywords, salary_min, salary_max, format, city, level, company_blacklist, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, title, keywords, salaryMin, salaryMax, format, city, level, blacklist, Date.now());
  const row = db.prepare("SELECT * FROM searches WHERE id = ?").get(result.lastInsertRowid) as SearchRow;
  return { ok: true, data: row };
}

export function setSearchActive(userId: number, searchId: number, active: boolean): ServiceResult<SearchRow> {
  const existing = db
    .prepare("SELECT * FROM searches WHERE id = ? AND user_id = ?")
    .get(searchId, userId) as SearchRow | undefined;
  if (!existing) return { ok: false, error: "Поиск не найден" };
  db.prepare("UPDATE searches SET active = ?, started_at = ? WHERE id = ?").run(
    active ? 1 : 0,
    active ? (existing.started_at ?? Date.now()) : null,
    searchId,
  );
  const row = db.prepare("SELECT * FROM searches WHERE id = ?").get(searchId) as SearchRow;
  return { ok: true, data: row };
}

export function deleteSearch(userId: number, searchId: number): ServiceResult<null> {
  const result = db.prepare("DELETE FROM searches WHERE id = ? AND user_id = ?").run(searchId, userId);
  if (result.changes === 0) return { ok: false, error: "Поиск не найден" };
  return { ok: true, data: null };
}

export function setAutoApplyPaused(userId: number, paused: boolean): void {
  db.prepare("UPDATE users SET autoapply_paused = ? WHERE id = ?").run(paused ? 1 : 0, userId);
}

export function isAutoApplyPaused(userId: number): boolean {
  const row = db.prepare("SELECT autoapply_paused FROM users WHERE id = ?").get(userId) as {
    autoapply_paused: number;
  };
  return Boolean(row.autoapply_paused);
}

export function listUserLetters(userId: number): { id: number; title: string; content: string; updated_at: number }[] {
  return db
    .prepare("SELECT id, title, content, updated_at FROM letters WHERE user_id = ? ORDER BY updated_at DESC")
    .all(userId) as { id: number; title: string; content: string; updated_at: number }[];
}

export function createLetter(userId: number, title: string, content: string): ServiceResult<{ id: number }> {
  const t = title.trim().slice(0, 100);
  const c = content.trim().slice(0, 20000);
  if (!t || !c) return { ok: false, error: "Укажите название и текст письма" };
  const now = Date.now();
  const result = db
    .prepare("INSERT INTO letters (user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(userId, t, c, now, now);
  return { ok: true, data: { id: Number(result.lastInsertRowid) } };
}

export function getResumeContent(userId: number, resumeId?: number): ServiceResult<{ id: number; content: string; title: string }> {
  const row = (resumeId
    ? db.prepare("SELECT id, title, content FROM resumes WHERE id = ? AND user_id = ?").get(resumeId, userId)
    : db.prepare("SELECT id, title, content FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(userId)) as
    | { id: number; title: string; content: string }
    | undefined;
  if (!row) return { ok: false, error: "Резюме не найдено" };
  return { ok: true, data: row };
}

/**
 * Ручной отклик (с сайта и из бота). Создаёт реальную запись с персонализированным письмом.
 */
export async function manualApply(
  user: User,
  input: { jobSlug: string; searchId?: number | null; resumeId?: number | null; letterId?: number | null },
): Promise<ServiceResult<{ application: ReturnType<typeof listApplications>[number] }>> {
  if (!isPlanActive(user)) return { ok: false, error: "Сначала активируйте пробный период или тариф" };

  const vacancy = getVacancyBySlug(input.jobSlug);
  if (!vacancy) return { ok: false, error: "Вакансия не найдена" };

  const limit = planDailyLimit(user.plan);
  if (limit > 0 && todayCount(user.id) >= limit) {
    return { ok: false, error: `Достигнут дневной лимит откликов (${limit})` };
  }

  const already = db
    .prepare("SELECT id FROM applications WHERE user_id = ? AND job_slug = ? AND withdrawn = 0")
    .get(user.id, vacancy.slug);
  if (already) return { ok: false, error: "Вы уже откликались на эту вакансию" };

  let message = "";
  const resumeRow = input.resumeId != null
    ? db.prepare("SELECT content FROM resumes WHERE id = ? AND user_id = ?").get(input.resumeId, user.id) as { content: string } | undefined
    : (db.prepare("SELECT content FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(user.id) as { content: string } | undefined);
  const resumeContent = resumeRow?.content ?? "";
  if (input.letterId != null) {
    const letter = db
      .prepare("SELECT content FROM letters WHERE id = ? AND user_id = ?")
      .get(input.letterId, user.id) as { content: string } | undefined;
    if (letter) message = (await personalizeLetter(letter.content, vacancy, resumeContent)).content;
  } else if (resumeContent) {
    message = (await personalizeLetter("", vacancy, resumeContent)).content;
  }

  const now = Date.now();
  const result = db
    .prepare(
      `INSERT INTO applications (user_id, job_slug, search_id, resume_id, letter_id, status, message, sent_at)
       VALUES (?, ?, ?, ?, ?, 'sent', ?, ?)`,
    )
    .run(user.id, vacancy.slug, input.searchId ?? null, input.resumeId ?? null, input.letterId ?? null, message, now);
  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(result.lastInsertRowid) as { id: number };
  const application = listApplications(user.id).find((a) => a.id === row.id);
  return { ok: true, data: { application: application! } };
}

export function getVacanciesSummary(): { count: number; sources: Record<string, number> } {
  const rows = db
    .prepare("SELECT source, COUNT(*) AS c FROM vacancies GROUP BY source")
    .all() as { source: string; c: number }[];
  const sources: Record<string, number> = {};
  let count = 0;
  for (const r of rows) {
    sources[r.source] = r.c;
    count += r.c;
  }
  return { count, sources };
}

export function getRecentApplications(userId: number, limit = 10): ReturnType<typeof listApplications> {
  return listApplications(userId, limit);
}

export { getStats };
export { getVacancyBySlug };
export { getCatalog };
export { matchesSearch };