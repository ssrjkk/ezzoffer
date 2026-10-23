import {
  requireUser,
  unauthorized,
  readJson,
  toPositiveNumber,
  validateSalaryRange,
  badRequest,
} from '@/lib/api';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCatalog } from '@/lib/vacancies';
import { matchCount, skillsByVacancy, type SearchRow } from '@/lib/matcher';
import { NO_STORE_HEADERS } from '@/lib/http';

function serialize(row: SearchRow) {
  return { ...row, match_count: matchCount(row) };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const rows = db
    .prepare('SELECT * FROM searches WHERE user_id = ? ORDER BY created_at DESC')
    .all(user.id) as SearchRow[];
  // Одна карта навыков на все поиски пользователя, а не пересчёт на каждый:
  // извлечение навыков — самая дорогая часть подсчёта (regex по словарю
  // на каждую вакансию), и N поисков делали её N раз подряд.
  const catalog = getCatalog();
  const shared = { catalog, skills: skillsByVacancy(catalog) };
  return Response.json(
    { searches: rows.map((r) => ({ ...r, match_count: matchCount(r, shared) })) },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { data, error } = await readJson<{
    title?: string;
    keywords?: string;
    salary_min?: number;
    salary_max?: number;
    format?: string;
    city?: string;
    level?: string;
    company_blacklist?: string;
  }>(request);
  if (error) return error;

  const title = (data?.title?.trim() || 'Новый поиск').slice(0, 100);
  const keywords = (data?.keywords?.trim() ?? '').slice(0, 400);
  const format = (data?.format?.trim() ?? '').slice(0, 20);
  const city = (data?.city?.trim() ?? '').slice(0, 60);
  const level = (data?.level?.trim() ?? '').slice(0, 20);
  const companyBlacklist = (data?.company_blacklist?.trim() ?? '').slice(0, 400);
  const salaryMin = toPositiveNumber(data?.salary_min);
  const salaryMax = toPositiveNumber(data?.salary_max);

  const rangeError = validateSalaryRange(salaryMin, salaryMax);
  if (rangeError) return badRequest(rangeError);

  /*
   * Потолок поисков на пользователя: создание поиска — дешёвая запись, и без
   * лимита скрипт плодил бы их тысячами (60 запросов в минуту по лимиту API).
   * 20 — с запасом выше реального использования: активные поиски сверх
   * десятка уже не просматриваются, а только грузят обновление каталога.
   */
  const existing = (
    db.prepare('SELECT COUNT(*) AS c FROM searches WHERE user_id = ?').get(user.id) as { c: number }
  ).c;
  if (existing >= 20) {
    return NextResponse.json(
      { error: 'Достигнут лимит поисков (20). Удалите неиспользуемые.' },
      { status: 409 },
    );
  }

  const result = db
    .prepare(
      `INSERT INTO searches (user_id, title, keywords, salary_min, salary_max, format, city, level, company_blacklist, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      user.id,
      title,
      keywords,
      salaryMin,
      salaryMax,
      format,
      city,
      level,
      companyBlacklist,
      Date.now(),
    );

  const row = db
    .prepare('SELECT * FROM searches WHERE id = ?')
    .get(result.lastInsertRowid) as SearchRow;
  return Response.json({ search: serialize(row) }, { status: 201 });
}
