import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";

// Мгновенная пауза всех автооткликов пользователя (и всех поисков).
export async function POST() {
  const user = await requireUser();
  if (!user) return unauthorized();

  db.prepare("UPDATE users SET autoapply_paused = 1 WHERE id = ?").run(user.id);
  db.prepare("UPDATE searches SET active = 0 WHERE user_id = ? AND active = 1").run(user.id);
  return NextResponse.json({ paused: true });
}