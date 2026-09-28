import { NextResponse } from "next/server";
import { requireUser, unauthorized, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { isPlanActive, planResumeLimit } from "@/lib/plans";
import { NO_STORE_HEADERS } from "@/lib/http";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const rows = db
    .prepare("SELECT * FROM resumes WHERE user_id = ? ORDER BY updated_at DESC")
    .all(user.id);
  return Response.json({ resumes: rows }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  if (!isPlanActive(user)) {
    return NextResponse.json(
      { error: "Сначала активируйте пробный период или тариф" },
      { status: 403 },
    );
  }
  const resumeLimit = planResumeLimit(user.plan);
  if (resumeLimit > 0) {
    const { c } = db
      .prepare("SELECT COUNT(*) AS c FROM resumes WHERE user_id = ?")
      .get(user.id) as { c: number };
    if (c >= resumeLimit) {
      return NextResponse.json(
        { error: `На тарифе «${user.plan === "start" ? "Старт" : user.plan}» доступно ${resumeLimit} резюме. Обновите тариф для большего количества.` },
        { status: 403 },
      );
    }
  }

  const { data, error } = await readJson<{ title?: string; content?: string; yearsLabel?: string }>(
    request,
  );
  if (error) return error;
  if (!data?.title?.trim() || !data?.content?.trim()) {
    return NextResponse.json({ error: "Укажите название и текст резюме" }, { status: 400 });
  }
  const title = data.title.trim().slice(0, 100);
  const content = data.content.trim().slice(0, 20000);
  const yearsLabel = (data.yearsLabel ?? "").trim().slice(0, 60);

  const now = Date.now();
  const result = db
    .prepare(
      `INSERT INTO resumes (user_id, title, content, years_label, ai_improved, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(user.id, title, content, yearsLabel, now, now);

  const row = db
    .prepare("SELECT * FROM resumes WHERE id = ?")
    .get(result.lastInsertRowid);
  return Response.json({ resume: row }, { status: 201 });
}