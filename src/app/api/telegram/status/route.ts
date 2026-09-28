import { requireUser, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { telegramConfigured } from "@/lib/telegram";
import { NO_STORE_HEADERS } from "@/lib/http";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const row = db.prepare("SELECT telegram_chat_id FROM users WHERE id = ?").get(user.id) as {
    telegram_chat_id: string | null;
  };
  return Response.json(
    { configured: telegramConfigured(), connected: Boolean(row.telegram_chat_id) },
    { headers: NO_STORE_HEADERS },
  );
}