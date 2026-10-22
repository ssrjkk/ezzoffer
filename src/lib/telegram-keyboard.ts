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

const DASHBOARD = (process.env.SITE_URL?.trim() || '').replace(/\/+$/, '');

/**
 * Ссылка на кабинет. Пусто — если SITE_URL не задан или непубличный:
 * кнопку с таким URL Telegram отклонит вместе со всем сообщением.
 */
function dashboardUrl(): string | null {
  if (!DASHBOARD) return null;
  let host = '';
  try {
    host = new URL(DASHBOARD).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0' || /^127\./.test(host)) {
    return null;
  }
  return `${DASHBOARD}/dashboard`;
}

/** Кнопка отклика на каждую вакансию плюс дополнительные ряды. */
export function keyboardFor(
  vacancies: readonly { title: string; company: string }[],
  extra: InlineKeyboard['inline_keyboard'][number][] = [],
): InlineKeyboard | undefined {
  if (vacancies.length === 0 && extra.length === 0) return undefined;
  const rows: InlineKeyboard['inline_keyboard'] = [
    ...vacancies.map((v, i) => [
      {
        text: `${i + 1}. ${fit(`${v.title} — ${v.company}`, 32)}`,
        data: `apply:${i + 1}`,
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
