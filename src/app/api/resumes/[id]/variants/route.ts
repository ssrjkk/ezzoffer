import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/api";
import { parseParamId } from "@/lib/http";
import { createVariant } from "@/lib/resume-variants";
import { NO_STORE_HEADERS } from "@/lib/http";

/**
 * POST /api/resumes/[id]/variants — создать редакцию «B» из «A».
 *
 * Идиом общий: requireUser → parseParamId → владение внутри createVariant.
 * Владение проверяется в домене, а не здесь, чтобы прямые вызовы функции из
 * бота и из роута проверяли одно и то же место.
 *
 * Ответ 404 отдаётся одинаковый для чужого и несуществующего резюме: иначе
 * инвариант I3 «чужой ресурс неотличим от несуществующего» перестаёт держаться.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { id: rawId } = await ctx.params;
  const id = parseParamId(rawId);
  if (id === null) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });

  const variant = createVariant(user.id, id);
  if (!variant) {
    return NextResponse.json({ error: "Резюме не найдено" }, { status: 404 });
  }

  return Response.json(
    { resume: variant },
    { status: 201, headers: NO_STORE_HEADERS },
  );
}