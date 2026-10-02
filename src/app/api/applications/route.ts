import { NextResponse } from "next/server";
import { requireUser, unauthorized, readJson } from "@/lib/api";
import { db, type User } from "@/lib/db";
import { isPlanActive, planDailyLimit } from "@/lib/plans";
import { listApplications, serializeApplication, type ApplicationRow } from "@/lib/applications";
import { getVacancyBySlug } from "@/lib/vacancies";
import { hhProvider } from "@/lib/vacancies/hh";
import { getValidHhToken } from "@/lib/hh-oauth";
import { personalizeLetter } from "@/lib/cover-letter";
import { NO_STORE_HEADERS } from "@/lib/http";

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit") ?? 200);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.floor(rawLimit)), 200) : 200;
  return Response.json({ applications: listApplications(user.id, limit) }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { data, error } = await readJson<{
    jobSlug?: string;
    searchId?: number | null;
    resumeId?: number | null;
    letterId?: number | null;
  }>(request);
  if (error) return error;

  const vacancy = getVacancyBySlug(data?.jobSlug ?? "");
  if (!vacancy) return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });

  if (data?.searchId != null) {
    const owned = db
      .prepare("SELECT id FROM searches WHERE id = ? AND user_id = ?")
      .get(data.searchId, user.id);
    if (!owned) return NextResponse.json({ error: "Поиск не найден" }, { status: 404 });
  }
  if (data?.resumeId != null) {
    const owned = db
      .prepare("SELECT id FROM resumes WHERE id = ? AND user_id = ?")
      .get(data.resumeId, user.id);
    if (!owned) return NextResponse.json({ error: "Резюме не найдено" }, { status: 404 });
  }
  if (data?.letterId != null) {
    const owned = db
      .prepare("SELECT id FROM letters WHERE id = ? AND user_id = ?")
      .get(data.letterId, user.id);
    if (!owned) return NextResponse.json({ error: "Письмо не найдено" }, { status: 404 });
  }

  if (!isPlanActive(user)) {
    return NextResponse.json(
      { error: "Сначала активируйте пробный период или тариф" },
      { status: 403 },
    );
  }

  const limit = planDailyLimit(user.plan);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM applications WHERE user_id = ? AND sent_at >= ? AND withdrawn = 0",
      )
      .get(user.id, todayStart.getTime()) as { c: number }
  ).c;
  if (limit > 0 && todayCount >= limit) {
    return NextResponse.json(
      { error: `Достигнут дневной лимит откликов (${limit}). Обновите тариф.` },
      { status: 429 },
    );
  }

  const existing = db
    .prepare("SELECT id FROM applications WHERE user_id = ? AND job_slug = ? AND withdrawn = 0")
    .get(user.id, vacancy.slug);
  if (existing) {
    return NextResponse.json({ error: "Вы уже откликались на эту вакансию" }, { status: 409 });
  }

  // Реальная персонализация письма под вакансию: ИИ (если настроен) с фолбэком на шаблон.
  let message = "";
  const resumeRow = data?.resumeId != null
    ? db.prepare("SELECT content FROM resumes WHERE id = ? AND user_id = ?").get(data.resumeId, user.id) as { content: string } | undefined
    : (db.prepare("SELECT content FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(user.id) as { content: string } | undefined);
  const resumeContent = resumeRow?.content ?? "";
  if (data?.letterId != null) {
    const letter = db
      .prepare("SELECT content FROM letters WHERE id = ? AND user_id = ?")
      .get(data.letterId, user.id) as { content: string } | undefined;
    if (letter) {
      const rendered = await personalizeLetter(letter.content, vacancy, resumeContent);
      message = rendered.content;
    }
  } else if (resumeContent) {
    const rendered = await personalizeLetter("", vacancy, resumeContent);
    message = rendered.content;
  }

  const now = Date.now();

  // Реальная отправка на hh.ru: если вакансия с hh.ru и аккаунт подключён —
  // отклик уходит через API, и только при успехе записывается в кабинет.
  if (vacancy.source === "hh") {
    const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as User;
    const hhResumeId = fresh.hh_resume_id?.trim();
    if (!hhResumeId) {
      return NextResponse.json(
        {
          error:
            "Для отклика на вакансию hh.ru подключите аккаунт hh.ru в разделе «Настройки» (нужно резюме на hh.ru).",
        },
        { status: 400 },
      );
    }
    const valid = await getValidHhToken(fresh);
    if (!valid) {
      return NextResponse.json(
        { error: "Подключение к hh.ru истекло. Переподключите аккаунт в «Настройках»." },
        { status: 401 },
      );
    }
    if (!hhProvider.apply) {
      return NextResponse.json({ error: "Отклики на hh.ru недоступны" }, { status: 502 });
    }
    const sent = await hhProvider.apply(vacancy, {
      resumeId: hhResumeId,
      message: message || undefined,
      accessToken: valid.token,
    });
    if (!sent.ok) {
      return NextResponse.json(
        { error: `hh.ru отклонил отклик: ${sent.error ?? "неизвестная ошибка"}` },
        { status: 502 },
      );
    }
  }

  const result = db
    .prepare(
      `INSERT INTO applications (user_id, job_slug, search_id, resume_id, letter_id, status, message, sent_at)
       VALUES (?, ?, ?, ?, ?, 'sent', ?, ?)`,
    )
    .run(user.id, vacancy.slug, data?.searchId ?? null, data?.resumeId ?? null, data?.letterId ?? null, message, now);
  const row = db
    .prepare("SELECT * FROM applications WHERE id = ?")
    .get(result.lastInsertRowid) as ApplicationRow;
  return Response.json({ application: serializeApplication(row) }, { status: 201, headers: NO_STORE_HEADERS });
}