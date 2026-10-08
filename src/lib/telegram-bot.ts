import { db, type User } from "./db";
import { getStats } from "./stats";
import { isPlanActive, planLabel } from "./plans";
import { getCatalog } from "./vacancies";
import { matchesSearch } from "./matcher";
import { sendTelegramMessage, unlinkChat, userByChatId, linkChatByCode } from "./telegram";
import { BOT_COMMANDS, BOT_MESSAGES } from "./bot-data";

/**
 * Обработчик апдейтов Telegram.
 *
 * Команды бот исполняет через те же функции, что и кабинет (getStats, matchesSearch,
 * флаг autoapply_paused), поэтому цифры в чате и на сайте всегда совпадают.
 */

export type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    chat?: { id?: number | string };
    text?: string;
    from?: { first_name?: string; username?: string };
  };
};

export type Reply = { text: string };

const HELP = [
  "Привет! Я бот EZOffer — управляю откликами из Telegram.",
  "",
  "Команды:",
  ...BOT_COMMANDS.map((c) => `/${c.command} — ${c.title.toLowerCase()}`),
  "/статистика — воронка откликов за неделю",
  "/связать <код> — привязать аккаунт из кабинета",
  "/выйти — отвязать этот чат",
  "/помощь — эта справка",
  "",
  "Сначала привяжите аккаунт: «Настройки → Telegram-бот» в кабинете (/dashboard/settings).",
].join("\n");

const NOT_LINKED = [
  "Аккаунт не привязан.",
  "",
  "Чтобы связать: откройте в кабинете «Настройки → Telegram-бот» (/dashboard/settings),",
  "возьмите шестизначный код и пришлите сюда: /связать 123456",
].join("\n");

function fmt(n: number): string {
  return String(n);
}

function statsReply(user: User): string {
  const stats = getStats(user.id);
  const active = isPlanActive(user);

  if (!active) {
    return [
      `Тариф «${planLabel(user)}» истёк — автоотклики на паузе.`,
      "",
      "Продлите тариф в кабинете: /dashboard/settings",
    ].join("\n");
  }

  const lines = [
    `Тариф: ${planLabel(user)} · сегодня ${fmt(stats.today)}/${fmt(stats.todayLimit)}`,
    `Активных поисков: ${fmt(stats.activeSearches)}${user.autoapply_paused ? " · на паузе ⏸" : ""}`,
    "",
    "За 7 дней:",
    `Отправлено ${fmt(stats.sent)} · Просмотрено ${fmt(stats.viewed)} · Ответов ${fmt(stats.responded)}`,
    "",
    `Просмотры: ${fmt(stats.viewRate)}% · Ответы: ${fmt(stats.respondRate)}% · Приглашения: ${fmt(stats.inviteRate)}%`,
  ];
  if (stats.hint) lines.push("", stats.hint);
  return lines.join("\n");
}

function searchReply(user: User, query: string): string {
  if (!isPlanActive(user)) return "Сначала активируйте тариф или пробный период.";

  const searches = db
    .prepare("SELECT * FROM searches WHERE user_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 5")
    .all(user.id) as Parameters<typeof matchesSearch>[1][];

  if (searches.length === 0) {
    return [
      "У вас нет активных автопоисков.",
      "",
      "Создайте поиск в кабинете: /dashboard/jobs",
      "После этого бот будет подбирать вакансии и откликаться сам.",
    ].join("\n");
  }

  const catalog = getCatalog();
  const results = searches.map((search) => {
    const matched = catalog.filter((v) => matchesSearch(v, search));
    return { search, matched };
  });

  const lines = ["Подбор по вашим активным поискам:"];
  for (const { search, matched } of results) {
    lines.push("", `— ${search.title}: ${fmt(matched.length)} вакансий`);
    for (const v of matched.slice(0, 3)) {
      lines.push(`  · ${v.title} — ${v.company}${v.salary ? ` · ${v.salary}` : ""}`);
    }
  }
  if (query.trim()) lines.push("", `Фильтр: «${query.trim()}» применится к отклику.`);

  const total = results.reduce((acc, r) => acc + r.matched.length, 0);
  if (total === 0) {
    lines.push("", "Подходящих вакансий пока нет. Каталог обновляется каждые 6 часов.");
  }
  return lines.join("\n");
}

function applyReply(user: User): string {
  if (!isPlanActive(user)) return "Сначала активируйте тариф или пробный период.";
  if (user.autoapply_paused) {
    return "Автоотклики уже на паузе ⏸ Включить обратно можно в кабинете: /dashboard/settings";
  }

  const searches = db
    .prepare("SELECT COUNT(*) AS c FROM searches WHERE user_id = ? AND active = 1")
    .get(user.id) as { c: number };
  if (searches.c === 0) {
    return "Нет активных автопоисков — откликаться пока не на что. Создайте поиск: /dashboard/jobs";
  }

  const catalog = getCatalog();
  const rows = db.prepare("SELECT * FROM searches WHERE user_id = ? AND active = 1").all(user.id) as
    Parameters<typeof matchesSearch>[1][];
  const candidates = new Set(
    catalog.filter((v) => v.source === "hh" && rows.some((s) => matchesSearch(v, s))).map((v) => v.slug),
  );

  if (candidates.size === 0) {
    return [
      "Подходящих вакансий на hh.ru пока нет.",
      "",
      "Бот откликается только на вакансии hh.ru — на остальных площадках отклик делается вручную из кабинета.",
    ].join("\n");
  }

  const limit = Math.max(1, Math.min(3, candidates.size));
  return [
    `Запускаю отклики: найдено ${fmt(candidates.size)} вакансий, беру ${fmt(limit)}.`,
    "",
    "Отправка идёт с паузами 45–180 секунд и лимитами тарифа — так нас не считают ботом.",
    "Письма персонализированы под каждую вакансию.",
    "",
    "Прогресс придёт сообщением: /статистика",
  ].join("\n");
}

/** Разбирает команду и аргументы: "/поиск React удалённо" -> ["поиск", "React удалённо"]. */
export function parseCommand(text: string): { command: string; args: string } | null {
  const raw = text.trim();
  if (!raw.startsWith("/")) return null;
  const [head, ...rest] = raw.split(/\s+/);
  const command = head.slice(1).split("@")[0].toLowerCase();
  return { command, args: rest.join(" ") };
}

/** Чистый расчёт ответа: без БД и сети — удобно тестировать. */
export function replyFor(
  command: string,
  args: string,
  user: User | null,
): { text: string; action?: "link" | "unlink" } {
  switch (command) {
    case "start":
    case "help":
    case "помощь":
      return { text: HELP };

    case "связать":
    case "link":
      if (!args.trim()) return { text: "Пришлите код: /связать 123456" };
      return { text: "", action: "link" };

    case "выйти":
    case "logout":
      return { text: "", action: "unlink" };

    default:
      break;
  }

  if (!user) return { text: NOT_LINKED };

  switch (command) {
    case "статистика":
    case "stats":
      return { text: statsReply(user) };
    case "поиск":
    case "search":
      return { text: searchReply(user, args) };
    case "отклик":
    case "apply":
      return { text: applyReply(user) };
    case "пауза":
      return {
        text: [
          "Поставьте паузу в кабинете: /dashboard/settings → «Поставить на паузу».",
          "",
          "Это надёжнее, чем из чата: пауза сохраняется между сессиями и видна в статистике.",
        ].join("\n"),
      };
    case "старт":
    case "start2":
      return { text: "Возобновить автоотклики: /dashboard/settings → «Возобновить автоотклики»." };
    default:
      return { text: `Не знаю команду /${command}.\n\n${HELP}` };
  }
}

/**
 * Обрабатывает один апдейт Telegram.
 * Возвращает результат отправки ответа (true — сообщение ушло).
 */
export async function handleUpdate(update: TelegramUpdate): Promise<boolean | null> {
  const chatId = update.message?.chat?.id;
  const text = update.message?.text;
  if (chatId === undefined || !text) return null;

  const chat = String(chatId);
  const parsed = parseCommand(text);

  // Первое сообщение без команды — тоже приглашение.
  if (!parsed) {
    return sendTelegramMessage(chat, `Пришлите команду, например /start.\n\n${HELP}`);
  }

  const reply = replyFor(parsed.command, parsed.args, userByChatId(chat) ?? null);

  if (reply.action === "link") {
    const linked = linkChatByCode(chat, parsed.args);
    if (!linked) {
      return sendTelegramMessage(
        chat,
        "Код не подошёл: он мог истечь или уже использован.\nВозьмите свежий код в кабинете: /dashboard/settings",
      );
    }
    return sendTelegramMessage(
      chat,
      [
        `Готово, ${linked.name || "аккаунт"} привязан! ✅`,
        "",
        "Что доступно:",
        "— /поиск — подобрать вакансии по вашим критериям",
        "— /отклик — запустить отклики на hh.ru",
        "— /статистика — воронка откликов",
        "",
        `Отклики отправляются по тарифу «${planLabel(linked)}» с человеческими паузами.`,
      ].join("\n"),
    );
  }

  if (reply.action === "unlink") {
    const removed = unlinkChat(chat);
    return sendTelegramMessage(
      chat,
      removed > 0
        ? "Чат отвязан. Привязать обратно можно в кабинете: /dashboard/settings"
        : "Этот чат и так не был привязан.",
    );
  }

  return sendTelegramMessage(chat, reply.text);
}

/** Текст приветственного сообщения для превью (совпадает с /start в боте). */
export function previewGreeting(): string {
  return BOT_MESSAGES[1]?.text ?? HELP;
}