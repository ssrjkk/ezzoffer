import { NextResponse } from "next/server";
import { db, getUserByEmail } from "@/lib/db";
import { createSession, hashPassword, publicUser, SESSION_COOKIE, isHttpsRequest } from "@/lib/auth";
import { readJson } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isUniqueViolation } from "@/lib/http";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (ip) {
    const ipLimiter = rateLimit(`register-ip:${ip}`, { windowMs: 15 * 60 * 1000, max: 10 });
    if (!ipLimiter.allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов. Попробуйте позже." },
        { status: 429, headers: { "Retry-After": String(ipLimiter.retryAfterSeconds) } },
      );
    }
  }

  const { data, error } = await readJson<{
    name?: string;
    email?: string;
    password?: string;
  }>(request);
  if (error) return error;

  const email = data?.email?.trim().toLowerCase();
  const password = data?.password ?? "";
  const name = (data?.name ?? "").trim();

  if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Укажите корректный email" }, { status: 400 });
  }
  if (password.length < 6 || password.length > 100) {
    return NextResponse.json({ error: "Пароль должен быть от 6 до 100 символов" }, { status: 400 });
  }
  if (name.length > 60) {
    return NextResponse.json({ error: "Имя слишком длинное (до 60 символов)" }, { status: 400 });
  }

  const emailLimiter = rateLimit(`register-email:${email}`, { windowMs: 60 * 60 * 1000, max: 5 });
  if (!emailLimiter.allowed) {
    return NextResponse.json(
      { error: "Слишком много запросов. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(emailLimiter.retryAfterSeconds) } },
    );
  }

  if (getUserByEmail(email)) {
    return NextResponse.json({ error: "Пользователь с таким email уже существует" }, { status: 409 });
  }

  try {
    db.prepare("INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
      email,
      name,
      hashPassword(password),
      Date.now(),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "Пользователь с таким email уже существует" }, { status: 409 });
    }
    throw err;
  }
  const user = getUserByEmail(email)!;
  const session = createSession(user.id);

  const res = NextResponse.json({ user: publicUser(user) }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expiresAt),
    secure: isHttpsRequest(request),
  });
  return res;
}