import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, rotateSession, isHttpsRequest } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const API_RATE_LIMIT = { windowMs: 60_000, max: 60 };

// Серверные «машины» без браузерного Origin-заголовка. Защищены собственными
// секретами (TELEGRAM_WEBHOOK_SECRET, CRON_SECRET), поэтому CSRF-проверка
// Origin к ним неприменима — иначе Telegram и cron не пройти.
const SERVER_TO_SERVER: string[] = ["/api/telegram/webhook", "/api/autoapply/run"];

// Rate-limiter хранит состояние в памяти — при нескольких инстансах сервера
// используйте внешний хранилище (Redis) или один инстанс.

export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const { pathname } = request.nextUrl;

  if (!token && pathname.startsWith("/dashboard")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (token && pathname.startsWith("/dashboard")) {
    const rotated = rotateSession(token);
    if (rotated) {
      const res = NextResponse.next();
      res.cookies.set(SESSION_COOKIE, rotated.token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: new Date(rotated.expiresAt),
        // isHttpsRequest, а не сравнение заголовка: в цепочке прокси
        // x-forwarded-proto бывает "https, http" — точное сравнение сняло бы
        // флаг Secure с ротированной сессии.
        secure: isHttpsRequest(request),
      });
      return res;
    }
  }

  const method = request.method.toUpperCase();
  const isServerRoute = SERVER_TO_SERVER.some((p) => pathname.startsWith(p));
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && pathname.startsWith("/api") && !isServerRoute) {
    const origin = request.headers.get("origin");
    if (!origin) {
      return NextResponse.json({ error: "Запрос отклонён: отсутствует Origin" }, { status: 403 });
    }
    const host = request.headers.get("host") ?? "";
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return NextResponse.json({ error: "Запрос отклонён: некорректный Origin" }, { status: 403 });
    }
    if (originHost !== host) {
      return NextResponse.json({ error: "Запрос отклонён: чужой Origin" }, { status: 403 });
    }

    const ip = clientIp(request) ?? "unknown";
    const limiter = rateLimit(`api:${ip}`, API_RATE_LIMIT);
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов. Попробуйте позже." },
        { status: 429, headers: { "Retry-After": String(limiter.retryAfterSeconds) } },
      );
    }
  } else if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && pathname.startsWith("/api") && isServerRoute) {
    // Серверные роуты без Origin всё равно ограничиваем — иначе их секрет
    // можно перебирать неограниченное число раз.
    const ip = clientIp(request) ?? "unknown";
    const limiter = rateLimit(`srv:${ip}`, { windowMs: 60_000, max: 30 });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: { "Retry-After": String(limiter.retryAfterSeconds) } },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};