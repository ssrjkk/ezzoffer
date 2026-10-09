import { NextResponse } from "next/server";
import { requireUser, unauthorized, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { parseParamId } from "@/lib/http";

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id: rawId } = await ctx.params;
  const id = parseParamId(rawId);
  if (id === null) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  const existing = db
    .prepare("SELECT * FROM letters WHERE id = ? AND user_id = ?")
    .get(id, user.id);
  if (!existing) return NextResponse.json({ error: "Письмо не найдено" }, { status: 404 });

  const { data, error } = await readJson<{ title?: string; content?: string }>(request);
  if (error) return error;
  const title = (data?.title?.trim() ?? "").slice(0, 100);
  const content = (data?.content?.trim() ?? "").slice(0, 20000);
  if (!title || !content) {
    return NextResponse.json({ error: "Укажите название и текст письма" }, { status: 400 });
  }
  db.prepare("UPDATE letters SET title = ?, content = ?, updated_at = ? WHERE id = ?").run(
    title,
    content,
    Date.now(),
    id,
  );
  return Response.json({ letter: db.prepare("SELECT * FROM letters WHERE id = ?").get(id) });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id: rawId } = await ctx.params;
  const id = parseParamId(rawId);
  if (id === null) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  const result = db.prepare("DELETE FROM letters WHERE id = ? AND user_id = ?").run(id, user.id);
  if (result.changes === 0) return NextResponse.json({ error: "Письмо не найдено" }, { status: 404 });
  return Response.json({ ok: true });
}