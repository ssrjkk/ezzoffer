import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { enhanceResume, scoreResume, detectKeywords } from "@/lib/resume-enhance";
import { enhanceResumeWithAi } from "@/lib/ai";
import { parseParamId } from "@/lib/http";

export async function POST(_request: Request, ctx: RouteContext<"/api/resumes/[id]/improve">) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id: rawId } = await ctx.params;
  const id = parseParamId(rawId);
  if (id === null) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });

  const resume = db
    .prepare("SELECT * FROM resumes WHERE id = ? AND user_id = ?")
    .get(id, user.id) as { id: number; content: string } | undefined;
  if (!resume) return NextResponse.json({ error: "Резюме не найдено" }, { status: 404 });

  const before = scoreResume(resume.content);

  // Сначала пробуем реальный ИИ-провайдер, если настроен; иначе — локальные эвристики.
  const ai = await enhanceResumeWithAi(resume.content);
  const enhanced = ai
    ? {
        content: ai.content,
        notes: ai.notes,
        tips: ai.tips,
        keywords: detectKeywords(ai.content),
        before,
        after: scoreResume(ai.content),
        engine: "ai" as const,
      }
    : {
        ...enhanceResume(resume.content),
        before,
        engine: "rules" as const,
      };

  db.prepare(
    `UPDATE resumes SET content = ?, ai_improved = 1, updated_at = ? WHERE id = ?`,
  ).run(enhanced.content, Date.now(), id);
  const row = db.prepare("SELECT * FROM resumes WHERE id = ?").get(id);

  return Response.json({
    resume: row,
    notes: enhanced.notes,
    tips: enhanced.tips,
    keywords: enhanced.keywords,
    score: { before: enhanced.before, after: enhanced.after },
    engine: enhanced.engine,
  });
}