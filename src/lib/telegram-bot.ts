import { db, type User } from "./db";
import { getStats } from "./stats";
import { isPlanActive, planLabel } from "./plans";
import { getCatalog } from "./vacancies";
import { matchesSearch, skillsByVacancy } from "./matcher";
import { applyToVacancy, getUserResumes } from "./autoapply";
import { rankVacancies } from "./resume-targeting";
import type { Vacancy } from "./vacancies/types";
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

/**
 * Защита от повторной обработки апдейта.
 *
 * Telegram ретраит доставку при не-2xx ответе, поэтому один и тот же update_id
 * может прийти несколько раз. Без проверки команда выполнялась повторно: для
 * /связать это не страшно (код одноразовый), а вот уведомления и статистика
 * рассылались бы дважды.
 *
 * Храним последние обработанные id в памяти процесса: update_id у Telegram
 * монотонно возрастает, поэтому достаточно отсекать всё, что уже встречалось.
 */
const seenUpdates = new Set<number>();
const SEEN_UPDATES_LIMIT = 1000;

/** Возвращает false, если апдейт уже обрабатывался. */
export function markUpdateSeen(updateId: number | undefined): boolean {
  if (updateId === undefined) return true;
  if (seenUpdates.has(updateId)) return false;
  seenUpdates.add(updateId);
  // Сдерживаем рост памяти: при переполнении вытесняем самые старые записи.
  if (seenUpdates.size > SEEN_UPDATES_LIMIT) {
    const excess = seenUpdates.size - SEEN_UPDATES_LIMIT;
    let removed = 0;
    for (const id of seenUpdates) {
      seenUpdates.delete(id);
      if (++removed >= excess) break;
    }
  }
  return true;
}

/** Сброс для тестов. */
export function resetSeenUpdates(): void {
  seenUpdates.clear();
}

export type Reply = { text: string; action?: BotAction };

/**
 * Что команда должна сделать помимо текста.
 *
 * Раньше здесь были только `link` и `unlink`, а `/пауза` и `/отклик`
 * отвечали текстом, не выполняя обещанного. Сайт при этом рекламировал
 * «Мгновенная остановка» и «Отклик с персонализацией».
 */
export type BotAction =
  | "link"
  | "unlink"
  | "pause"
  | "resume"
  | { kind: "apply"; vacancy: Vacancy };

/** Ставит и снимает паузу. Возвращает, изменилось ли что-то. */
function setPaused(user: User, paused: boolean): boolean {
  const result = db
    .prepare("UPDATE users SET autoapply_paused = ? WHERE id = ?")
    .run(paused ? 1 : 0, user.id);
  return result.changes > 0;
}

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

/**
 * Ответ на `/отклик`.
 *
 * Раньше здесь обещали «Запускаю отклики… Прогресс придёт сообщением», но
 * команда не делала ровно ничего: ни одного запроса, ни одного уведомления.
 * Человек нажимал и ждал откликов, которых не было. `notifyUser` и
 * `notifyAll` вообще не вызывались ниоткуда.
 *
 * Теперь команда работает: без номера показывает пронумерованный подбор,
 * с номером — отправляет один отклик через applyToVacancy, то есть тем же
 * кодом, что и плановый прогон.
 */
function applyReply(user: User, args: string): { text: string; action?: BotAction } {
  if (!isPlanActive(user)) return { text: "Сначала активируйте тариф или пробный период." };
  if (user.autoapply_paused) {
    return { text: "Автоотклики на паузе ⏸ Снимите паузу: /старт" };
  }

  const searches = db
    .prepare("SELECT * FROM searches WHERE user_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 5")
    .all(user.id) as Parameters<typeof matchesSearch>[1][];

  if (searches.length === 0) {
    return { text: "Нет активных автопоисков — откликаться пока не на что. Создайте поиск: /dashboard/jobs" };
  }

  const catalog = getCatalog();
  const skills = skillsByVacancy(catalog);
  const resumes = getUserResumes(user.id);
  const seen = new Set<string>();
  const matched = catalog.filter(
    (v) =>
      v.source === "hh" &&
      searches.some((s) => matchesSearch(v, s, skills.get(v.slug))) &&
      !seen.has(v.slug) &&
      seen.add(v.slug),
  );

  if (matched.length === 0) {
    return {
      text: [
        "Подходящих вакансий на hh.ru пока нет.",
        "",
        "Бот откликается только на вакансии hh.ru — на остальных площадках отклик делается вручную из кабинета.",
      ].join("\n"),
    };
  }

  /*
   * Нумерация — по совпадению с резюме, а не по порядку каталога.
   *
   * Иначе «/отклик 2» означал бы произвольную вакансию из выдачи (порядок
   * задаётся сортировкой по источнику и названию), и человек нажимал бы на
   * номер, не понимая, что выберет. Тот же порядок, что на сайте: сначала то,
   * что подходит лучше всего.
   */
  const ranked = rankVacancies(matched, resumes, skills);

  const index = Number(args.trim());
  if (Number.isFinite(index) && Number.isInteger(index) && index >= 1) {
    const target = ranked[index - 1]?.vacancy;
    if (!target) {
      return { text: `В подборе только ${ranked.length} вакансий. Позовите /подбор, чтобы увидеть список.` };
    }
    return { text: "", action: { kind: "apply", vacancy: target } };
  }

  const lines = ["Подбор по вашим активным поискам:", ""];
  for (const [i, r] of ranked.slice(0, 5).entries()) {
    const v = r.vacancy;
    const fit = r.ratio > 0 ? ` · навыков ${Math.round(r.ratio * 100)}%` : "";
    lines.push(`${i + 1}. ${v.title} — ${v.company}${v.salary ? ` · ${v.salary}` : ""}${fit}`);
  }
  lines.push("", `Всего найдено: ${fmt(ranked.length)}`, "", "Откликнуться: /отклик 1, /отклик 2 и так далее.");
  return { text: lines.join("\n") };
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
): Reply {
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
    case "подбор":
    case "поиск":
    case "search":
      return { text: searchReply(user, args) };
    case "отклик":
    case "apply":
      return applyReply(user, args);
    case "пауза":
    case "stop":
      return { text: "", action: "pause" };
    case "старт":
    case "run":
    case "resume":
      return { text: "", action: "resume" };
    default:
      return { text: `Не знаю команду /${command}.\n\n${HELP}` };
  }
}

/**
 * Обрабатывает один апдейт Telegram.
 * Возвращает результат отправки ответа (true — сообщение ушло).
 */
export async function handleUpdate(update: TelegramUpdate): Promise<boolean | null> {
  // Telegram повторно доставляет апдейт при не-2xx ответе; обрабатывать его
  // второй раз нельзя, иначе пользователь получит дубликат ответа.
  if (!markUpdateSeen(update.update_id)) return null;

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
        "— /подбор — вакансии по вашим критериям",
        "— /отклик 1 — откликнуться на вакансию №1 из подбора",
        "— /статистика — воронка откликов",
        "— /пауза и /старт — остановить и возобновить отправку",
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

  /*
   * Пауза и возобновление.
   *
   * Раньше обе команды отвечали «сделайте это в кабинете», хотя сайт
   * рекламировал мгновенную остановку прямо в боте. Теперь состояние
   * меняется здесь и сразу видно в кабинете — это одна и та же строка в БД.
   */
  if (reply.action === "pause") {
    const user = userByChatId(chat);
    if (!user) return sendTelegramMessage(chat, NOT_LINKED);
    const changed = setPaused(user, true);
    const queued = db
      .prepare("SELECT COUNT(*) AS c FROM searches WHERE user_id = ? AND active = 1")
      .get(user.id) as { c: number };
    return sendTelegramMessage(
      chat,
      changed
        ? [
            "Автоотклики на паузе ⏸",
            "",
            queued.c > 0
              ? `Остановлю отправку сразу. Активных поисков: ${queued.c} — на возобновлении они вернутся в очередь.`
              : "Активных поисков нет, так что ничего не теряется.",
            "",
            "Продолжить: /старт",
          ].join("\n")
        : "Автоотклики уже были на паузе.",
    );
  }

  if (reply.action === "resume") {
    const user = userByChatId(chat);
    if (!user) return sendTelegramMessage(chat, NOT_LINKED);
    if (!isPlanActive(user)) {
      return sendTelegramMessage(
        chat,
        [
          `Тариф «${planLabel(user)}» истёк — сначала продлите его.`,
          "",
          "Продлить: /dashboard/settings",
        ].join("\n"),
      );
    }
    const changed = setPaused(user, false);
    const queued = db
      .prepare("SELECT COUNT(*) AS c FROM searches WHERE user_id = ? AND active = 1")
      .get(user.id) as { c: number };
    return sendTelegramMessage(
      chat,
      changed
        ? [
            "Отправка возобновлена ✅",
            "",
            queued.c > 0
              ? `Активных поисков: ${queued.c}. Следующий прогон — в ближайшие минуты.`
              : "Но активных поисков нет: создайте поиск, иначе откликаться не на что.",
          ].join("\n")
        : "Отправка уже была включена.",
    );
  }

  /*
   * Отклик на конкретную вакансию.
   *
   * Единственное место, где бот отправляет отклик по прямому указанию.
   * Идёт через applyToVacancy — тот же код, что у планового прогона, поэтому
   * лимиты, паузы, подбор резюме и письмо работают одинаково.
   */
  if (typeof reply.action === "object" && reply.action.kind === "apply") {
    const user = userByChatId(chat);
    if (!user) return sendTelegramMessage(chat, NOT_LINKED);

    const vacancy = reply.action.vacancy;
    const result = await applyToVacancy(user, vacancy);

    if (result.ok) {
      return sendTelegramMessage(
        chat,
        [
          "Отклик отправлен ✅",
          "",
          `Вакансия: ${vacancy.title}`,
          `Компания: ${vacancy.company}`,
          result.withLetter ? "Сопроводительное письмо приложено." : "Без письма — подходящего текста не нашлось.",
          "",
          "Статистика: /статистика",
        ].join("\n"),
      );
    }
    return sendTelegramMessage(chat, `Не отправил: ${result.error}`);
  }

  return sendTelegramMessage(chat, reply.text);
}

/** Текст приветственного сообщения для превью (совпадает с /start в боте). */
export function previewGreeting(): string {
  return BOT_MESSAGES[1]?.text ?? HELP;
}