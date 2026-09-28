import { NextResponse } from "next/server";
import { handleTelegramUpdate, sendTelegramMessage, telegramConfigured, telegramWebhookSecret } from "@/lib/telegram";
import { logError } from "@/lib/logger";

// Вебхук Telegram Bot API. Безопасность: секретный заголовок + размер тела.
export async function POST(request: Request) {
  if (!telegramConfigured()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const secret = telegramWebhookSecret();
  if (secret) {
    const received = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (received !== secret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  const text = await request.text();
  if (text.length > 64_000) return NextResponse.json({ ok: true });

  let update: Parameters<typeof handleTelegramUpdate>[0];
  try {
    update = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const reply = await handleTelegramUpdate(update);
    if (reply && update.message?.chat?.id) {
      await sendTelegramMessage(update.message.chat.id, reply);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("telegram:webhook", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}