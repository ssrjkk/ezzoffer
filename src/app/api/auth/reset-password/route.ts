import { NextResponse } from "next/server";
import { db, type User } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { readJson } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";

function findValidResetUser(token: string): User | undefined {
  return db
    .prepare("SELECT * FROM users WHERE password_reset_token = ? AND password_reset_expires > ?")
    .get(token, Date.now()) as User | undefined;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Укажите токен сброса пароля" }, { status: 400 });
  }
  if (!findValidResetUser(token)) {
    return NextResponse.json({ error: "Ссылка недействительна или истекла" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (ip) {
    const ipLimiter = rateLimit(`reset-ip:${ip}`, { windowMs: 15 * 60 * 1000, max: 10 });
    if (!ipLimiter.allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов. Попробуйте позже." },
        { status: 429, headers: { "Retry-After": String(ipLimiter.retryAfterSeconds) } },
      );
    }
  }

  const { data, error } = await readJson<{ token?: string; password?: string }>(request);
  if (error) return error;

  const token = data?.token?.trim() ?? "";
  const password = data?.password ?? "";

  if (!token) {
    return NextResponse.json({ error: "Укажите токен сброса пароля" }, { status: 400 });
  }
  if (password.length < 6 || password.length > 100) {
    return NextResponse.json({ error: "Пароль должен быть от 6 до 100 символов" }, { status: 400 });
  }

  const user = findValidResetUser(token);
  if (!user) {
    return NextResponse.json({ error: "Ссылка недействительна или истекла" }, { status: 400 });
  }

  db.prepare(
    "UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?",
  ).run(hashPassword(password), user.id);
  return NextResponse.json({ ok: true });
}
