import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db, getUserByEmail } from "@/lib/db";
import { readJson } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/notify";

const RESET_TTL_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (ip) {
    const ipLimiter = rateLimit(`forgot-ip:${ip}`, { windowMs: 15 * 60 * 1000, max: 10 });
    if (!ipLimiter.allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов. Попробуйте позже." },
        { status: 429, headers: { "Retry-After": String(ipLimiter.retryAfterSeconds) } },
      );
    }
  }

  const { data, error } = await readJson<{ email?: string }>(request);
  if (error) return error;

  const email = data?.email?.trim().toLowerCase() ?? "";
  if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Укажите корректный email" }, { status: 400 });
  }

  const user = getUserByEmail(email);
  if (user) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + RESET_TTL_MS;
    db.prepare(
      "UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?",
    ).run(token, expiresAt, user.id);
    await sendPasswordResetEmail(user.email, token);
  }

  return NextResponse.json({ ok: true });
}
