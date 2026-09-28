import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const { pathname } = request.nextUrl;

  if (!token && pathname.startsWith("/dashboard")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Защита от CSRF: для изменяющих запросов к API требуем корректный Origin.
  // Браузеры всегда отправляют Origin при POST/PUT/DELETE, в т.ч. same-origin.
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && pathname.startsWith("/api")) {
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
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};