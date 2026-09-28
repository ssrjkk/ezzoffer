import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { parseParamId } from "@/lib/http";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/applications/[id]">) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id: rawId } = await ctx.params;
  const id = parseParamId(rawId);
  if (id === null) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  const result = db
    .prepare("UPDATE applications SET withdrawn = 1 WHERE id = ? AND user_id = ?")
    .run(id, user.id);
  if (result.changes === 0) {
    return NextResponse.json({ error: "Отклик не найден" }, { status: 404 });
  }
  return Response.json({ ok: true });
}