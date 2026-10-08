import { requireUser, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { issueLinkCode, telegramConfigured, telegramWebhookSecret, unlinkChat } from "@/lib/telegram";
import { NO_STORE_HEADERS } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Текущее состояние привязки + свежий код для привязки.
 *
 * POST намеренно не поддерживается: код выдаётся только авторизованному
 * пользователю, а создание привязки делает бот по команде /связать.
 */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const fresh = db.prepare("SELECT telegram_chat_id FROM users WHERE id = ?").get(user.id) as {
    telegram_chat_id: string | null;
  };

  return Response.json(
    {
      botConfigured: telegramConfigured() && Boolean(telegramWebhookSecret()),
      linked: Boolean(fresh.telegram_chat_id),
      chatId: fresh.telegram_chat_id ?? null,
      code: issueLinkCode(user.id),
      codeTtlMinutes: 15,
    },
    { headers: NO_STORE_HEADERS },
  );
}

/** Отвязать чат. */
export async function DELETE() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const removed = unlinkChat(user.telegram_chat_id ?? "");
  return Response.json({ ok: true, removed: removed > 0 });
}