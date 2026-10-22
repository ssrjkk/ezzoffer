import { db } from './db';

export type BookmarkItem = {
  slug: string;
  createdAt: number;
  /** Вакансия ещё в каталоге. Нет — показываем «закрыта», а не пустую карточку. */
  available: boolean;
  title: string | null;
  company: string | null;
  salary: string | null;
  city: string | null;
  /** Источник: публичная /jobs/[slug] знает только демо-набор (local). */
  source: string | null;
  sourceUrl: string | null;
  publishedAt: number | null;
};

/**
 * Закладки пользователя одним запросом.
 *
 * Раньше каждая закладка тянула точечный getVacancyBySlug — N+1, и логика
 * жила в двух местах (страница кабинета и /api/bookmarks), которые уже
 * разошлись: страница не знала про source, и ссылка из избранного вела на
 * 404 для любой живой вакансии.
 */
export function listBookmarks(userId: number): BookmarkItem[] {
  const rows = db
    .prepare('SELECT job_slug, created_at FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as { job_slug: string; created_at: number }[];

  type Row = {
    slug: string;
    title: string;
    company: string;
    salary: string;
    city: string;
    source: string;
    source_url: string | null;
    published_at: number | null;
  };
  const bySlug = new Map<string, Row>();
  if (rows.length > 0) {
    const placeholders = rows.map(() => '?').join(',');
    const found = db
      .prepare(`SELECT * FROM vacancies WHERE slug IN (${placeholders})`)
      .all(...rows.map((r) => r.job_slug)) as Row[];
    for (const v of found) bySlug.set(v.slug, v);
  }

  return rows.map((r) => {
    const v = bySlug.get(r.job_slug);
    return {
      slug: r.job_slug,
      createdAt: r.created_at,
      available: Boolean(v),
      title: v?.title ?? null,
      company: v?.company ?? null,
      salary: v?.salary ?? null,
      city: v?.city ?? null,
      source: v?.source ?? null,
      sourceUrl: v?.source_url ?? null,
      publishedAt: v?.published_at ?? null,
    };
  });
}
