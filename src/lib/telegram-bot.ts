import {
  mainKeyboard,
  commandKeyboard,
  keyboardFor,
} from "./telegram-keyboard";

// Реэкспорт: клавиатуры живут в отдельном модуле, но это часть бота, и
// потребители (тесты, превью) обращаются к telegram-bot.
export { mainKeyboard, commandKeyboard, keyboardFor };

import { db, type User } from "./db";
import { getStats } from "./stats";
import { isPlanActive, planLabel } from "./plans";
import { getCatalog } from "./vacancies";
import { matchesSearch, skillsByVacancy } from "./matcher";
import { applyToVacancy, getUserResumes } from "./autoapply";
import { rankVacancies } from "./resume-targeting";
import type { Vacancy } from "./vacancies/types";
import {
  sendTelegramMessage,
  unlinkChat,
  userByChatId,
  linkChatByCode,
  answerCallbackQuery,
  editTelegramMessage,
  escapeHtml,
  type InlineKeyboard,
} from "./telegram";
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
  /**
   * Нажатие кнопки под сообщением.
   *
   * Отдельный вид апдейта: у него нет `text`, и без этой ветки бот молчал бы
   * на любое нажатие. Для человека это выглядит как сломанная кнопка.
   */
  callback_query?: {
    id?: string;
    data?: string;
    message_id?: number;
    chat?: { id?: number | string };
    message?: { message_id?: number; chat?: { id?: number | string } };
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

export type Reply = {
  text: string;
  action?: BotAction;
  /** Кнопки под сообщением; undefined — сообщение без кнопок. */
  keyboard?: InlineKeyboard;
};

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
function applyReply(user: User, args: string): Reply {
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
        "<b>Подходящих вакансий на hh.ru пока нет.</b>",
        "",
        "Бот откликается только на вакансии hh.ru — на остальных площадках отклик делается вручную из кабинета.",
      ].join("\n"),
      keyboard: mainKeyboard(),
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
      return {
        text: `В подборе только ${ranked.length} вакансий. Нажмите «Подбор вакансий», чтобы увидеть список.`,
        keyboard: mainKeyboard(),
      };
    }
    return { text: "", action: { kind: "apply", vacancy: target } };
  }

  /*
   * Список показывается пятью лучшими, а не всеми: под каждым заголовком в
   * подбор попадают сотни вакансий, и список на двадцать строк в чате никто не
   * не читает. Ограничение прямо названо, чтобы «показано 5» не читалось как
   * «показаны все».
   */
  const shown = ranked.slice(0, 5);
  const lines = [`<b>Подбор по вашим активным поискам</b>`, ""];
  for (const [i, r] of shown.entries()) {
    const v = r.vacancy;
    const match = r.ratio > 0 ? ` · навыков ${Math.round(r.ratio * 100)}%` : "";
    lines.push(
      `${i + 1}. ${escapeHtml(v.title)} — ${escapeHtml(v.company)}${v.salary ? ` · ${escapeHtml(v.salary)}` : ""}${match}`,
    );
  }
  if (ranked.length > shown.length) {
    lines.push("", `и ещё ${ranked.length - shown.length} — в кабинете виден полный список.`);
  }

  /*
   * Кнопки под списком, а не только команды.
   *
   * Команда «/отклик 2» требует помнить номер и угадывать, есть ли он вообще.
   * Кнопка ставит выбор рядом с названием вакансии, и промахнуться нельзя.
   */
  return {
    text: lines.join("\n"),
    keyboard: keyboardFor(
      shown.map((r) => ({ title: r.vacancy.title, company: r.vacancy.company })),
      [
        [
          { text: "Статистика", data: "menu:stats" },
          { text: "Пауза", data: "menu:pause" },
        ],
      ],
    ),
  };
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
      return { text: HELP, keyboard: commandKeyboard() };

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
      return { text: statsReply(user), keyboard: mainKeyboard() };
    /*
     * Подбор и отклик — одна команда.
     *
     * Раньше их было три: /подбор показывал сводку по поискам, /поиск делал
     * то же самое, а /отклик — отдельный список. Человек получал три разных
     * экрана на один и тот же вопрос и не мог понять, где ему откликнуться.
     *
     * Теперь: без номера — список с кнопками, с номером — отклик на вакансию
     * из этого списка. Команда одна, поведение очевидное.
     */
    case "подбор":
    case "поиск":
    case "search":
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
      return { text: `Не знаю команду /${command}.\n\n${HELP}`, keyboard: commandKeyboard() };
  }
}

/**
 * Нажатие кнопки под сообщением.
 *
 * Отдельная ветка, потому что у колбэка нет текста: он приходит в
 * `callback_query`, и обработчик текстовых команд его просто игнорировал бы —
 * кнопка выглядела бы рабочей и не делала ничего.
 *
 * Ответ подтверждается всегда, даже при ошибке: иначе кнопка «часит» секунд
 * десять, и человек нажимает её повторно — то есть отправляет второй отклик.
 */
async function handleCallback(update: TelegramUpdate): Promise<boolean | null> {
  const cb = update.callback_query;
  if (!cb) return null;

  const chatId = cb.chat?.id ?? cb.message?.chat?.id;
  const data = cb.data ?? "";
  if (chatId === undefined) return null;
  const chat = String(chatId);

  const user = userByChatId(chat) ?? null;
  if (!user) {
    if (cb.id) await answerCallbackQuery(cb.id, { text: "Аккаунт не привязан" });
    return sendTelegramMessage(chat, NOT_LINKED, { keyboard: commandKeyboard(), html: true });
  }

  const [kind, value] = data.split(":");

  if (kind === "menu") {
    const command =
      value === "search"
        ? "подбор"
        : value === "stats"
          ? "статистика"
          : value === "pause"
            ? "пауза"
            : value === "resume"
              ? "старт"
              : "помощь";

    /*
     * Действие выполняется ДО правки сообщения.
     *
     * Обратный порядок был багом: правка возвращала true, обработчик на этом
     * выходил — и пауза не наступала. Кнопка выглядела работающей, а отклики
     * продолжали уходить. Ровно тот случай, который страшнее отсутствия
     * кнопки: человек нажимает «Пауза» и не получает откликов.
     */
    if (command === "пауза" || command === "старт") {
      if (cb.id) await answerCallbackQuery(cb.id);
      const text = togglePause(chat, command === "пауза");
      if (cb.message_id !== undefined) {
        const changed = await editTelegramMessage(chat, cb.message_id, text, {
          keyboard: mainKeyboard(),
          html: true,
        });
        if (changed) return true;
      }
      return sendTelegramMessage(chat, text, { keyboard: mainKeyboard(), html: true });
    }

    const reply = replyFor(command, "", user);
    if (cb.id) await answerCallbackQuery(cb.id);

    const text = reply.text || HELP;
    const changed =
      cb.message_id !== undefined
        ? await editTelegramMessage(chat, cb.message_id, text, {
            keyboard: reply.keyboard,
            html: true,
          })
        : false;

    if (changed) return true;
    return sendTelegramMessage(chat, text, { keyboard: reply.keyboard, html: true });
  }

  if (kind === "apply" && value) {
    if (cb.id) await answerCallbackQuery(cb.id, { text: "Отправляю…" });
    const reply = applyReply(user, value);
    const action = reply.action;
    if (!action || typeof action !== "object") {
      const text = reply.text || "Не удалось выбрать вакансию.";
      if (cb.message_id !== undefined) {
        await editTelegramMessage(chat, cb.message_id, text, {
          keyboard: mainKeyboard(),
          html: true,
        });
      }
      return sendTelegramMessage(chat, text, { keyboard: mainKeyboard(), html: true });
    }
    return runApplyFromChat(chat, action.vacancy, cb.message_id);
  }

  if (cb.id) await answerCallbackQuery(cb.id, { text: "Кнопка устарела" });
  return sendTelegramMessage(chat, "Эта кнопка из старого сообщения. Откройте подбор заново.", {
    keyboard: mainKeyboard(),
    html: true,
  });
}

/**
 * Обрабатывает один апдейт Telegram.
 * Возвращает результат отправки ответа (true — сообщение ушло).
 */
export async function handleUpdate(update: TelegramUpdate): Promise<boolean | null> {
  // Telegram повторно доставляет апдейт при не-2xx ответе; обрабатывать его
  // второй раз нельзя, иначе пользователь получит дубликат ответа.
  if (!markUpdateSeen(update.update_id)) return null;

  if (update.callback_query) return handleCallback(update);

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

  if (reply.action === "pause" || reply.action === "resume") {
    if (!userByChatId(chat)) return sendTelegramMessage(chat, NOT_LINKED);
    return sendTelegramMessage(chat, togglePause(chat, reply.action === "pause"), {
      keyboard: mainKeyboard(),
      html: true,
    });
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
    return runApplyFromChat(chat, reply.action.vacancy);
  }

  return sendTelegramMessage(chat, reply.text, { keyboard: reply.keyboard, html: true });
}

/**
 * Отправка отклика и ответ в чат.
 *
 * Общая функция для команды и для кнопки: раньше это были два места, и
 * правка одного не доезжала до другого — текст про успех и про отказ
 * расходился.
 *
 * После кнопки сообщение правится на месте, а не отправляется новым: иначе
 * переписка превращалась бы в стопку одинаковых «Готово», и нужный ответ
 * уезжал бы наверх.
 */
async function runApplyFromChat(
  chat: string,
  vacancy: Vacancy,
  replaceMessageId?: number,
): Promise<boolean | null> {
  const user = userByChatId(chat);
  if (!user) return sendTelegramMessage(chat, NOT_LINKED, { keyboard: commandKeyboard(), html: true });

  const result = await applyToVacancy(user, vacancy);
  const opts = { keyboard: mainKeyboard(), html: true };

  if (!result.ok) {
    const text = `Не отправил: ${escapeHtml(result.error)}`;
    if (replaceMessageId !== undefined) {
      await editTelegramMessage(chat, replaceMessageId, text, opts);
    }
    return sendTelegramMessage(chat, text, opts);
  }

  const text = [
    "<b>Отклик отправлен ✅</b>",
    "",
    `Вакансия: ${escapeHtml(vacancy.title)}`,
    `Компания: ${escapeHtml(vacancy.company)}`,
    result.withLetter
      ? "Сопроводительное письмо приложено."
      : "Без письма — подходящего текста не нашлось.",
  ].join("\n");

  if (replaceMessageId !== undefined) {
    const changed = await editTelegramMessage(chat, replaceMessageId, text, opts);
    if (changed) return true;
  }
  return sendTelegramMessage(chat, text, opts);
}

/**
 * Пауза и возобновление — одна функция для команды и кнопки.
 *
 * Раньше это были два места. Кнопка правила сообщение раньше, чем меняла
 * состояние, и правка возвращала true — обработчик на этом выходил, а пауза
 * не наступала. Кнопка выглядела работающей, а отклики продолжали уходить.
 * Общая функция исключает такой порядок по построению.
 */
function togglePause(chat: string, paused: boolean): string {
  const user = userByChatId(chat);
  if (!user) return NOT_LINKED;

  if (!paused && !isPlanActive(user)) {
    return [
      `Тариф «${planLabel(user)}» истёк — сначала продлите его.`,
      "",
      "Продлить: /dashboard/settings",
    ].join("\n");
  }

  const changed = setPaused(user, paused);
  const queued = db
    .prepare("SELECT COUNT(*) AS c FROM searches WHERE user_id = ? AND active = 1")
    .get(user.id) as { c: number };

  if (!changed) {
    return paused ? "Автоотклики уже были на паузе." : "Отправка уже была включена.";
  }

  if (paused) {
    return [
      "<b>Автоотклики на паузе ⏸</b>",
      "",
      queued.c > 0
        ? `Остановлю отправку сразу. Активных поисков: ${queued.c} — на возобновлении они вернутся в очередь.`
        : "Активных поисков нет, так что ничего не теряется.",
    ].join("\n");
  }

  return [
    "<b>Отправка возобновлена ✅</b>",
    "",
    queued.c > 0
      ? `Активных поисков: ${queued.c}. Следующий прогон — в ближайшие минуты.`
      : "Но активных поисков нет: создайте поиск, иначе откликаться не на что.",
  ].join("\n");
}

/** Текст приветственного сообщения для превью (совпадает с /start в боте). */
export function previewGreeting(): string {
  return BOT_MESSAGES[1]?.text ?? HELP;
}