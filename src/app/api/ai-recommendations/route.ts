import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { getCatalog } from "@/lib/vacancies";
import { rankVacanciesForResume, getRecommendations } from "@/lib/ai-matching";
import { NO_STORE_HEADERS } from "@/lib/http";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const resume = db.prepare("SELECT content, title FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(user.id) as { content: string; title: string } | undefined;

  if (!resume) {
    return NextResponse.json({ error: "Сначала создайте резюме" }, { status: 400 });
  }

  const vacancies = getCatalog();
  const ranked = rankVacanciesForResume(vacancies, resume.content, resume.title);
  const recommendations = getRecommendations(resume.content, resume.title, ranked);

  return NextResponse.json({
    recommendations,
    topVacancies: ranked.slice(0, 5).map((r) => ({
      slug: r.vacancy.slug,
      title: r.vacancy.title,
      company: r.vacancy.company,
      score: r.score,
      matchedSkills: r.matchedSkills,
      missingSkills: r.missingSkills,
    })),
  }, { headers: NO_STORE_HEADERS });
}