import { NextResponse } from "next/server";
import { db, type User } from "@/lib/db";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Укажите токен подтверждения" }, { status: 400 });
  }

  const user = db
    .prepare("SELECT * FROM users WHERE email_verification_token = ?")
    .get(token) as User | undefined;
  if (!user) {
    return NextResponse.json({ error: "Ссылка недействительна" }, { status: 400 });
  }

  const [, expiresAt] = user.email_verification_token!.split(".");
  if (!expiresAt || Number(expiresAt) <= Date.now()) {
    return NextResponse.json({ error: "Ссылка истекла. Запросите новое письмо." }, { status: 400 });
  }

  db.prepare("UPDATE users SET email_verified = 1, email_verification_token = NULL WHERE id = ?").run(
    user.id,
  );
  return NextResponse.json({ ok: true });
}
