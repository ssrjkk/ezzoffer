import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";

export async function POST() {
  const user = await requireUser();
  if (!user) return unauthorized();
  db.prepare("UPDATE users SET telegram_chat_id = NULL WHERE id = ?").run(user.id);
  db.prepare("DELETE FROM telegram_codes WHERE user_id = ?").run(user.id);
  return NextResponse.json({ ok: true });
}