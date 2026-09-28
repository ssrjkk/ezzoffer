import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { telegramConfigured, botUsername } from "@/lib/telegram";
import { randomBytes } from "node:crypto";
import { NO_STORE_HEADERS } from "@/lib/http";

// Генерация кода привязки Telegram: пользователь получает код в кабинете
// и отправляет его боту командой /link <код>.
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  if (!telegramConfigured()) {
    return NextResponse.json({ error: "Telegram-бот не настроен на сервере" }, { status: 503 });
  }

  const code = randomBytes(6).toString("hex").toUpperCase();
  db.prepare("DELETE FROM telegram_codes WHERE user_id = ?").run(user.id);
  db.prepare("INSERT INTO telegram_codes (code, user_id, expires_at) VALUES (?, ?, ?)").run(
    code,
    user.id,
    Date.now() + 15 * 60 * 1000,
  );

  return NextResponse.json(
    { code, bot: botUsername(), expires_in: 15 * 60 },
    { headers: NO_STORE_HEADERS },
  );
}