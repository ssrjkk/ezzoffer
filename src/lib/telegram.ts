import { db } from "./db";
import { collectDigest, smtpConfigured } from "./notify";
import { SOURCE_LABELS } from "./source-labels";
import {
  getStats,
  listUserSearches,
  createSearch,
  setSearchActive,
  deleteSearch,
  setAutoApplyPaused,
  isAutoApplyPaused,
  listUserLetters,
  createLetter,
  getRecentApplications,
  getVacanciesSummary,
} from "./services";
import { logError, logInfo } from "./logger";

/**
 * Telegram-бот — полное управление EZOffer из чата: поиски, отклики,
 * письма, пауза автооткликов, статистика. Та же логика, что и на сайте
 * (общий сервисный слой). Включается через env: TELEGRAM_BOT_TOKEN.
 */

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

export function telegramWebhookSecret(): string {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
}

export function botUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME?.trim() ?? "";
}

async function apiCall(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN не настроен" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.description ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Экранирование пользовательских данных для Telegram HTML (parse_mode=HTML). */
export function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendTelegramMessage(chatId: number | string, text: string): Promise<boolean> {
  const result = await apiCall("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
  if (!result.ok) logError("telegram:send", new Error(result.error ?? "send failed"), { chatId });
  return result.ok;
}

export type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    from?: { id?: number | string };
  };
};

function chatIdOfUser(userId: number): number | string | null {
  const row = db.prepare("SELECT telegram_chat_id FROM users WHERE id = ?").get(userId) as {
    telegram_chat_id: number | string | null;
  } | undefined;
  return row?.telegram_chat_id ?? null;
}

export async function sendDigestToUser(userId: number): Promise<boolean> {
  const chatId = chatIdOfUser(userId);
  if (!chatId) return false;
  return sendTelegramMessage(chatId, buildDigestText(userId));
}

function userByChat(chatId: number | string): number | null {
  const row = db.prepare("SELECT id FROM users WHERE telegram_chat_id = ?").get(String(chatId)) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}

export function buildStatusText(userId: number): string {
  const s = getStats(userId);
  const paused = isAutoApplyPaused(userId);
  return [
    "📊 <b>Ваш поиск в EZOffer</b>",
    "",
    `Отправлено: ${s.sent}`,
    `Просмотров резюме: ${s.viewed}`,
    `Ответов HR: ${s.responded}`,
    `Приглашений: ${s.invited}`,
    `Отказов: ${s.declined}`,
    `Активных поисков: ${s.activeSearches}`,
    `Сегодня: ${s.today} / ${s.todayLimit}`,
    "",
    paused ? "⏸ Автоотклики на паузе" : "▶ Автоотклики активны",
  ].join("\n");
}

export function buildDigestText(userId: number): string {
  const d = collectDigest(userId);
  const lines = [
    "📈 <b>Дневной отчёт EZOffer</b>",
    "",
    `Отправлено сегодня: ${d.sentToday}`,
    `Просмотров резюме: ${d.viewed}`,
    `Ответов HR: ${d.responded}`,
    `Приглашений: ${d.invited}`,
    `Активных поисков: ${d.activeSearches}`,
  ];
  if (d.newResponses.length) {
    lines.push("", "Новые ответы:");
    for (const r of d.newResponses)
      lines.push(`• ${escapeTelegramHtml(r.title)} (${escapeTelegramHtml(r.company)}): ${escapeTelegramHtml(r.note || r.response)}`);
  }
  if (smtpConfigured()) lines.push("", "Также доступен email-отчёт.");
  return lines.join("\n");
}

function buildSearchesText(userId: number): string {
  const searches = listUserSearches(userId);
  if (!searches.length) return "🔍 Поисков пока нет. Создайте командой:\n/new <название> | <ключевые слова>";
  return [
    "🔍 <b>Ваши поиски:</b>",
    "",
    ...searches.map((s) => {
      const status = s.active ? "▶ активен" : "⏸ пауза";
      const filters = [s.level, s.format, s.city, s.salary_min ? `от ${s.salary_min}` : null]
        .filter(Boolean)
        .join(" · ");
      return `#${s.id} <b>${escapeTelegramHtml(s.title)}</b> — ${status}\n    ${escapeTelegramHtml(s.keywords || "без ключей")}${filters ? `\n    ${filters}` : ""}`;
    }),
    "",
    "Команды: /on &lt;id&gt;, /off &lt;id&gt;, /del &lt;id&gt;",
  ].join("\n");
}

function buildLettersText(userId: number): string {
  const letters = listUserLetters(userId);
  if (!letters.length) return "✉️ Писем пока нет. Создайте: /letter <название> | <текст>";
  return ["✉️ <b>Ваши сопроводительные письма:</b>", "", ...letters.map((l) => `#${l.id} ${escapeTelegramHtml(l.title)}`)].join("\n");
}

function buildApplicationsText(userId: number): string {
  const apps = getRecentApplications(userId, 10);
  if (!apps.length) return "📬 Откликов пока нет.";
  return [
    "📬 <b>Последние отклики:</b>",
    "",
    ...apps.map((a) => {
      const job = a.job ? `${escapeTelegramHtml(a.job.title)} · ${escapeTelegramHtml(a.job.company)}` : escapeTelegramHtml(a.job_slug);
      return `• ${job} — ${escapeTelegramHtml(a.status_label)}`;
    }),
  ].join("\n");
}

function buildCatalogText(): string {
  const summary = getVacanciesSummary();
  const lines = ["🗂 <b>Каталог вакансий:</b>", "", `Всего: ${summary.count}`];
  for (const [source, count] of Object.entries(summary.sources)) {
    const label = SOURCE_LABELS[source] ?? source;
    lines.push(`• ${label}: ${count}`);
  }
  return lines.join("\n");
}

function getHelpText(): string {
  const username = botUsername();
  const bot = username ? `@${username}` : "бот";
  return [
    `Привет! Это ${bot} — помощник EZOffer.`,
    "",
    "<b>Управление:</b>",
    "/status — статистика",
    "/digest — дневной отчёт",
    "/searches — список поисков",
    "/new <название> | <ключи> — создать поиск",
    "/on <id> — запустить поиск",
    "/off <id> — поставить поиск на паузу",
    "/del <id> — удалить поиск",
    "/pause — пауза всех автооткликов",
    "/resume — возобновить автоотклики",
    "/letters — список писем",
    "/letter <название> | <текст> — создать письмо",
    "/apps — последние отклики",
    "/catalog — каталог вакансий",
    "",
    "<b>Аккаунт:</b>",
    "/link <код> — привязать аккаунт",
    "/unlink — отвязать",
    "",
    "Код для привязки — в кабинете: Настройки → Telegram.",
  ].join("\n");
}

async function linkChatByCode(chatId: number | string, code: string): Promise<string> {
  const row = db.prepare("SELECT user_id, expires_at FROM telegram_codes WHERE code = ?").get(code.trim()) as
    | { user_id: number; expires_at: number }
    | undefined;
  if (!row) return "❌ Код не найден. Проверьте и попробуйте снова.";
  if (row.expires_at <= Date.now()) {
    db.prepare("DELETE FROM telegram_codes WHERE code = ?").run(code.trim());
    return "❌ Код истёк. Сгенерируйте новый в кабинете.";
  }
  db.prepare("UPDATE users SET telegram_chat_id = ? WHERE id = ?").run(String(chatId), row.user_id);
  db.prepare("DELETE FROM telegram_codes WHERE code = ?").run(code.trim());
  logInfo("telegram:link", "чат привязан", { userId: row.user_id, chatId });
  return "✅ Аккаунт подключён! Отправьте /status, чтобы увидеть статистику.";
}

async function createSearchCommand(chatId: number | string, rest: string[]): Promise<string> {
  const userId = userByChat(chatId);
  if (!userId) return "⚠️ Сначала привяжите аккаунт: /link <код>.";
  const raw = rest.join(" ").trim();
  const [title, keywords] = raw.split("|").map((s) => s?.trim() ?? "");
  const result = createSearch(userId, { title, keywords });
  if (!result.ok) return `❌ ${result.error}`;
  return `✅ Поиск «${result.data.title}» создан (#${result.data.id}).\nЗапустить: /on ${result.data.id}`;
}

async function createLetterCommand(chatId: number | string, rest: string[]): Promise<string> {
  const userId = userByChat(chatId);
  if (!userId) return "⚠️ Сначала привяжите аккаунт: /link <код>.";
  const raw = rest.join(" ").trim();
  const [title, content] = raw.split("|").map((s) => s?.trim() ?? "");
  const result = createLetter(userId, title, content);
  if (!result.ok) return `❌ ${result.error}`;
  return `✅ Письмо «${title}» создано (#${result.data.id}).`;
}

function requireId(rest: string[]): number | null {
  const n = Number(rest[0]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Обработка входящего апдейта от Telegram. Возвращает текст ответа или null.
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<string | null> {
  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim();
  if (!chatId || !text) return null;

  const [cmd, ...rest] = text.split(/\s+/);

  // Команды, не требующие привязки.
  if (cmd === "/start") return getHelpText();
  if (cmd === "/link") return linkChatByCode(chatId, rest[0] ?? "");
  if (cmd === "/unlink") {
    const result = db.prepare("UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = ?").run(String(chatId));
    return result.changes ? "✅ Аккаунт отвязан." : "⚠️ Не был подключён.";
  }
  if (cmd === "/catalog") return buildCatalogText();

  // Остальные требуют привязки.
  const userId = userByChat(chatId);
  if (!userId) return "⚠️ Аккаунт не подключён. Откройте «Настройки → Telegram» в кабинете и отправьте код.";

  switch (cmd) {
    case "/status":
      return buildStatusText(userId);
    case "/digest":
      return buildDigestText(userId);
    case "/searches":
      return buildSearchesText(userId);
    case "/new":
      return createSearchCommand(chatId, rest);
    case "/on": {
      const id = requireId(rest);
      if (!id) return "Укажите id поиска: /on <id>";
      const r = setSearchActive(userId, id, true);
      return r.ok ? `✅ Поиск «${r.data.title}» запущен.` : `❌ ${r.error}`;
    }
    case "/off": {
      const id = requireId(rest);
      if (!id) return "Укажите id поиска: /off <id>";
      const r = setSearchActive(userId, id, false);
      return r.ok ? `⏸ Поиск «${r.data.title}» на паузе.` : `❌ ${r.error}`;
    }
    case "/del": {
      const id = requireId(rest);
      if (!id) return "Укажите id поиска: /del <id>";
      const r = deleteSearch(userId, id);
      return r.ok ? "✅ Поиск удалён." : `❌ ${r.error}`;
    }
    case "/pause":
      setAutoApplyPaused(userId, true);
      db.prepare("UPDATE searches SET active = 0 WHERE user_id = ? AND active = 1").run(userId);
      return "⏸ Автоотклики поставлены на паузу.";
    case "/resume":
      setAutoApplyPaused(userId, false);
      return "▶ Автоотклики возобновлены. Запустите поиски заново командой /on <id>.";
    case "/letters":
      return buildLettersText(userId);
    case "/letter":
      return createLetterCommand(chatId, rest);
    case "/apps":
      return buildApplicationsText(userId);
    default:
      return getHelpText();
  }
}