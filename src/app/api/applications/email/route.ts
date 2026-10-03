import { NextResponse } from "next/server";
import { requireUser, unauthorized, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { isPlanActive, planDailyLimit } from "@/lib/plans";
import { getVacancyBySlug } from "@/lib/vacancies";
import { personalizeLetter } from "@/lib/cover-letter";
import { sendResumeEmail, smtpConfigured } from "@/lib/notify";
import { NO_STORE_HEADERS } from "@/lib/http";

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { data, error } = await readJson<{
    jobSlug?: string;
    resumeId?: number | null;
    letterId?: number | null;
  }>(request);
  if (error) return error;

  const vacancy = getVacancyBySlug(data?.jobSlug ?? "");
  if (!vacancy) return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });
  if (!vacancy.contact_email || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(vacancy.contact_email)) {
    return NextResponse.json(
      { error: "У этой вакансии нет корректного контактного email — отправка резюме по почте недоступна" },
      { status: 400 },
    );
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

  if (!smtpConfigured()) {
    return NextResponse.json(
      { error: "SMTP не настроен на сервере — добавьте SMTP_* в .env и перезапустите сервер" },
      { status: 502 },
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

  const resumeRow = data?.resumeId != null
    ? db.prepare("SELECT content FROM resumes WHERE id = ? AND user_id = ?").get(data.resumeId, user.id) as { content: string } | undefined
    : (db.prepare("SELECT content FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(user.id) as { content: string } | undefined);
  const resumeContent = resumeRow?.content ?? "";

  let message = "";
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

  const sent = await sendResumeEmail({
    to: vacancy.contact_email,
    company: vacancy.company,
    vacancyTitle: vacancy.title,
    candidateName: user.name || "кандидат",
    resumeText: resumeContent,
    message,
  });
  if (!sent.ok) {
    return NextResponse.json({ error: sent.error ?? "Не удалось отправить резюме по email" }, { status: 502 });
  }

  const now = Date.now();
  const result = db
    .prepare(
      `INSERT INTO applications (user_id, job_slug, resume_id, letter_id, status, message, external_url, sent_at)
       VALUES (?, ?, ?, ?, 'sent', ?, ?, ?)`,
    )
    .run(
      user.id,
      vacancy.slug,
      data?.resumeId ?? null,
      data?.letterId ?? null,
      message,
      vacancy.source_url,
      now,
    );
  return Response.json(
    {
      ok: true,
      application_id: result.lastInsertRowid,
      note: `Резюме отправлено на ${vacancy.contact_email}`,
    },
    { status: 201, headers: NO_STORE_HEADERS },
  );
}