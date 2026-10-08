import { randomInt } from "node:crypto";

import { db, type User } from "./db";
import { logInfo } from "./logger";

/**
 * Telegram-бот EZOffer: привязка аккаунта и команды.
 *
 * Бот работает через webhook (Telegram сам шлёт апдейты на наш /api/telegram/webhook)
 * и повторяет логику кабинета: те же лимиты, та же статистика из getStats,
 * та же пауза. Ничего не дублируется — команды вызывают существующие функции.
 */

const SEND_TIMEOUT_MS = 10_000;
const TELEGRAM_TEXT_LIMIT = 4096;
const CODE_TTL_MS = 15 * 60 * 1000;

export function telegramConfigured(): boolean {
  return Boolean(envToken());
}

function envToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

/** Секрет для проверки заголовка X-Telegram-Bot-Api-Secret-Token. */
export function telegramWebhookSecret(): string | null {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
}

/**
 * Отправка сообщения в Telegram с таймаутом и ограничением длины текста:
 * без таймаута зависший API держал бы запрос открытым, а текст длиннее лимита
 * Telegram отверг бы с 400.
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const token = envToken();
  if (!token) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, TELEGRAM_TEXT_LIMIT),
        disable_web_page_preview: true,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      logInfo("telegram", `отправка не удалась: HTTP ${res.status}`, { chatId });
      return false;
    }
    logInfo("telegram", "сообщение отправлено", { chatId });
    return true;
  } catch (err) {
    logInfo("telegram", `ошибка отправки: ${err instanceof Error ? err.message : "unknown"}`, {
      chatId,
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Код привязки: 6 цифр, чтобы его можно было продиктовать в чат. */
export function generateLinkCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Создаёт код привязки для пользователя. Старые коды пользователя удаляются,
 * иначе в telegram_codes копились бы просроченные строки.
 */
export function issueLinkCode(userId: number, now = Date.now()): string {
  purgeExpiredCodes(now);
  const code = generateLinkCode();
  db.prepare("DELETE FROM telegram_codes WHERE user_id = ?").run(userId);
  db.prepare("INSERT INTO telegram_codes (code, user_id, expires_at) VALUES (?, ?, ?)").run(
    code,
    userId,
    now + CODE_TTL_MS,
  );
  return code;
}

export function purgeExpiredCodes(now = Date.now()): number {
  const result = db.prepare("DELETE FROM telegram_codes WHERE expires_at <= ?").run(now);
  return result.changes;
}

/**
 * Привязывает Telegram-чат к аккаунту по коду.
 * Код одноразовый и с TTL, поэтому чужим чатом аккаунт не захватить.
 */
export function linkChatByCode(chatId: string, code: string, now = Date.now()): User | null {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) return null;

  const row = db
    .prepare("SELECT user_id, expires_at FROM telegram_codes WHERE code = ?")
    .get(normalized) as { user_id: number; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at <= now) {
    db.prepare("DELETE FROM telegram_codes WHERE code = ?").run(normalized);
    return null;
  }

  // Один аккаунт — один чат. Раньше запрос записывал chatId в те же строки,
  // где он уже был, то есть ничего не менял: старый аккаунт продолжал получать
  // уведомления на тот же чат, хотя чат теперь привязан к новому.
  db.prepare("UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = ? AND id != ?").run(
    chatId,
    row.user_id,
  );
  db.prepare("UPDATE users SET telegram_chat_id = ? WHERE id = ?").run(chatId, row.user_id);
  db.prepare("DELETE FROM telegram_codes WHERE code = ?").run(normalized);

  return db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id) as User;
}

export function unlinkChat(chatId: string): number {
  const result = db.prepare("UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = ?").run(chatId);
  return result.changes;
}

export function userByChatId(chatId: string): User | undefined {
  return db.prepare("SELECT * FROM users WHERE telegram_chat_id = ?").get(chatId) as User | undefined;
}

export async function notifyUser(userId: number, text: string): Promise<boolean> {
  const user = db
    .prepare("SELECT telegram_chat_id FROM users WHERE id = ?")
    .get(userId) as { telegram_chat_id: string | null } | undefined;
  if (!user?.telegram_chat_id) return false;
  return sendTelegramMessage(user.telegram_chat_id, text);
}

export async function notifyAll(text: string): Promise<number> {
  const users = db
    .prepare("SELECT id, telegram_chat_id FROM users WHERE telegram_chat_id IS NOT NULL")
    .all() as { id: number; telegram_chat_id: string }[];
  let sent = 0;
  for (const user of users) {
    if (await sendTelegramMessage(user.telegram_chat_id, text)) sent++;
  }
  return sent;
}

export { CODE_TTL_MS };