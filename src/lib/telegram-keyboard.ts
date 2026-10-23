import type { InlineKeyboard } from './telegram';

/**
 * Клавиатуры бота.
 *
 * Отдельный модуль без единого импорта, тянущего базу или сеть. Причина не в
 * красоте: главная страница показывает разговор с ботом, и подписи на кнопках
 * в этом макете должны быть теми же строками, что бот отправляет по-настоящему.
 * Пока клавиатуры жили внутри telegram-bot.ts, сверить их с демонстрацией было
 * нечем — модуль тянет ./db, и проверка молча выродилась бы в «команды
 * встречаются в тексте диалога», то есть проверяла бы не то.
 *
 * Главное соображение: человек не обязан помнить синтаксис. Кнопка «Откликнуться
 * на №1» не может быть промахнута по цифре, а команда «/отклик 2» — может, и
 * промах означает отклик на чужую вакансию.
 */

/**
 * Обрезка подписи кнопки.
 *
 * Telegram не переносит длинные подписи и обрезает их многоточием прямо в
 * интерфейсе. Обрезка здесь — чтобы точка обрезания была осмысленной
 * («Верстальщик в Авито…»), а не случайной.
 */
function fit(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Основное меню: всегда доступно, поэтому человек не остаётся без ходов. */
export function mainKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: 'Подбор вакансий', data: 'menu:search' },
        { text: 'Статистика', data: 'menu:stats' },
      ],
      [
        { text: 'Собеседование', data: 'menu:interview' },
        { text: 'Избранное', data: 'menu:bookmarks' },
      ],
      [
        { text: 'Пауза', data: 'menu:pause' },
        { text: 'Помощь', data: 'menu:help' },
      ],
    ],
  };
}

/** Команды списком — вместо набора /подбор, /статистика, /пауза. */
export function commandKeyboard(): InlineKeyboard {
  const rows: InlineKeyboard['inline_keyboard'] = [
    [
      { text: 'Подбор вакансий', data: 'menu:search' },
      { text: 'Статистика', data: 'menu:stats' },
    ],
    [
      { text: 'Собеседование', data: 'menu:interview' },
      { text: 'Избранное', data: 'menu:bookmarks' },
    ],
    [
      { text: 'Пауза', data: 'menu:pause' },
      { text: 'Продолжить', data: 'menu:resume' },
    ],
  ];
  /*
   * Кнопка кабинета — только с публичным SITE_URL.
   *
   * Telegram отвергает в кнопках localhost-ссылки 400 («Wrong HTTP URL»),
   * причём падает ВЕСЬ запрос, а не одна кнопка: из-за неё не доходило даже
   * /start. Локальный стенд живёт на http://localhost:3000, и тащить его URL
   * в кнопку бессмысленно дважды: телефон пользователя его всё равно не
   * откроет. Без публичного адреса ряд просто не показываем.
   */
  const url = dashboardUrl();
  if (url) rows.push([{ text: 'Открыть кабинет', url }]);
  return { inline_keyboard: rows };
}

/**
 * Ссылка на кабинет. Пусто — если SITE_URL не задан или непубличный:
 * кнопку с таким URL Telegram отклонит вместе со всем сообщением.
 *
 * Env читается при каждом вызове, а не при импорте модуля: иначе тест или
 * процесс, поднявший модуль до установки SITE_URL, навсегда оставался бы
 * без кнопки кабинета (или, наоборот, с протухшим хостом).
 */
function dashboardUrl(): string | null {
  const base = (process.env.SITE_URL?.trim() ?? '').replace(/\/+$/, '');
  if (!base) return null;
  let host = '';
  try {
    host = new URL(base).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0' || /^127\./.test(host)) {
    return null;
  }
  return `${base}/dashboard`;
}

/**
 * Короткий идентификатор вакансии для callback_data.
 *
 * Telegram режет callback_data на 64 байтах: slug целиком (до 140 символов,
 * см. company.ts) в кнопку не влезает — запрос отклоняется целиком и сообщение
 * не уходит вообще. Индекс (`apply:1`) влезает, но указывает на N-ю вакансию
 * ТЕКУЩЕГО ранжирования: каталог между показом и нажатием успевает
 * обновиться, номера съезжают, и отклик уходит на чужую вакансию — ровно тот
 * промах, ради которого кнопки вообще делались вместо команд.
 *
 * Хеш (FNV-1a, 8 hex-символов) — компромисс: стабилен при сдвиге списка,
 * влезает в лимит, а обработчик сверяет его с вакансией под тем же номером и
 * при расхождении просит нажать ещё раз вместо отправки не туда. Коллизия
 * 1/4 млрд на кнопку; при совпадении двух строк сразу — отказ, а не угадайка.
 * Не криптография: секретности здесь нет, нужна только привязка.
 */
export function slugHash(slug: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Кнопка отклика на каждую вакансию плюс дополнительные ряды. */
export function keyboardFor(
  vacancies: readonly { title: string; company: string; slug: string }[],
  extra: InlineKeyboard['inline_keyboard'][number][] = [],
): InlineKeyboard | undefined {
  if (vacancies.length === 0 && extra.length === 0) return undefined;
  const rows: InlineKeyboard['inline_keyboard'] = [
    ...vacancies.map((v, i) => [
      {
        text: `${i + 1}. ${fit(`${v.title} — ${v.company}`, 32)}`,
        data: `apply:${i + 1}:${slugHash(v.slug)}`,
      },
    ]),
    ...extra,
  ];
  return { inline_keyboard: rows };
}

/** Все подписи, которые бот способен отправить: для сверки с демонстрацией. */
/**
 * Подписи, которые бот собирает не из набора, а по ходу работы.
 *
 * Лежат здесь, а не в telegram-bot.ts, потому что демонстрация бота на главной
 * сверяется с настоящими клавиатурами. Пока подписи жили в telegram-bot,
 * сверять их было нечем — модуль тянет базу, — и проверка превратилась в «есть
 * ли эти слова в тексте диалога», то есть проверяла текст, а не кнопки.
 */
export const DYNAMIC_LABELS = {
  /** Ещё страница вопросов на собеседовании. */
  interviewMore: 'Ещё вопросы',
  /** Ещё страница избранного. */
  bookmarksMore: 'Ещё',
  /** Откликнуться на отложенную вакансию. */
  bookmarkApply: (n: number) => `Откликнуться на №${n}`,
  /** Убрать из избранного. */
  bookmarkRemove: 'Убрать',
} as const;

/** Все подписи, которые бот способен отправить: для сверки с демонстрацией. */
export function knownButtonLabels(): Set<string> {
  const labels = new Set<string>();
  const collect = (kb: InlineKeyboard): void => {
    for (const row of kb.inline_keyboard) for (const b of row) labels.add(b.text);
  };
  collect(mainKeyboard());
  collect(commandKeyboard());
  labels.add(DYNAMIC_LABELS.interviewMore);
  labels.add(DYNAMIC_LABELS.bookmarksMore);
  labels.add(DYNAMIC_LABELS.bookmarkRemove);
  labels.add(DYNAMIC_LABELS.bookmarkApply(1));
  /*
   * Кнопки отклика на вакансию из подбора: подпись строится из названия,
   * поэтому конкретных строк здесь нет — их сверяют по форме
   * «N. Название — Компания» отдельно.
   */
  return labels;
}
