import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/db";
import { createSession, verifyPassword, publicUser, SESSION_COOKIE, isHttpsRequest } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { readJson } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Защита от перебора: лимит привязан к аккаунту (работает и без TRUST_PROXY),
// а не к глобальному "local"-ключу, который заблокировал бы всех пользователей.
const ACCOUNT_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 };

// Фиктивный хэш для выравнивания времени проверки несуществующего аккаунта:
// scrypt отрабатывает одинаково, не позволяя перечислять email по таймингу.
const DUMMY_HASH = hashPassword("dummy-timing-equalizer");

export async function POST(request: Request) {
  const { data, error } = await readJson<{ email?: string; password?: string }>(request);
  if (error) return error;

  const email = data?.email?.trim().toLowerCase() ?? "";
  const password = data?.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Укажите email и пароль" }, { status: 400 });
  }

  const ip = clientIp(request);
  if (ip) {
    const ipLimiter = rateLimit(`login-ip:${ip}`, { windowMs: 15 * 60 * 1000, max: 30 });
    if (!ipLimiter.allowed) {
      return NextResponse.json(
        { error: "Слишком много попыток входа. Попробуйте позже." },
        { status: 429, headers: { "Retry-After": String(ipLimiter.retryAfterSeconds) } },
      );
    }
  }

  const accountLimiter = rateLimit(`login-account:${email}`, ACCOUNT_LIMIT);
  if (!accountLimiter.allowed) {
    return NextResponse.json(
      { error: "Слишком много попыток входа для этого аккаунта. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(accountLimiter.retryAfterSeconds) } },
    );
  }

  const user = getUserByEmail(email);
  // Всегда выполняем scrypt-проверку (против хэша аккаунта или фиктивного),
  // чтобы время ответа не зависело от существования email.
  const valid = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !valid) {
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  if (!user.email_verified) {
    return NextResponse.json(
      { error: "Подтвердите email по ссылке из письма" },
      { status: 403 },
    );
  }

  const session = createSession(user.id);
  const res = NextResponse.json({ user: publicUser(user) });
  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expiresAt),
    secure: isHttpsRequest(request),
  });
  return res;
}