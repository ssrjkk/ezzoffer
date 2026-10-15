import { db } from "./db";
import { getCatalog } from "./vacancies";
import type { Vacancy } from "./vacancies/types";
import {
  DIRECTION_LABELS,
  WORK_MODE_LABELS,
  detectDirection,
  detectWorkMode,
  type Direction,
  type WorkMode,
} from "./direction";
import type { Level } from "./data";

/**
 * Подработка и фриланс.
 *
 * Запрос человека «хочу подработку на вечер, фронтенд» — это фильтр, а не
 * список. Пока в продукте нет ни режима работы, ни направления, такой запрос
 * превращается в «вот тысяча вакансий, ищи сам», и это ровно та работа,
 * которую человек и не хотел делать.
 *
 * Всё считается на лету из каталога, без отдельного хранилища: классификация
 * детерминированная, пересчитывать её при каждом обновлении источников не
 * нужно, а второе место хранения со временем разошлось бы с первым.
 *
 * Чего здесь нет: обещания, что подработка найдётся всегда. Пустой фильтр
 * показывает пустой результат и говорит об этом прямо — список источников
 * конечен, и притворяться иначе было бы враньём, которое человек обнаружит
 * через неделю.
 */

export type GigFilter = {
  mode?: WorkMode;
  direction?: Direction;
  level?: Level;
  limit?: number;
};

export type Gig = {
  slug: string;
  title: string;
  company: string;
  city: string;
  level: Level;
  format: string;
  posted: string;
  category: string;
  source: string;
  sourceLabel: string;
  sourceUrl: string | null;
  direction: Direction;
  directionLabel: string;
  mode: WorkMode;
  /** Ручной лид: отклик отправляется на площадке, автоматически — нет. */
  manual: boolean;
};

const SOURCE_LABELS_LOCAL: Record<string, string> = {
  local: "EZOffer",
  trudvsem: "Работа России",
  hh: "hh.ru",
  remoteok: "RemoteOK",
  greenhouse: "Greenhouse",
  ashby: "Ashby",
  company: "RSS компании",
  x: "X / Twitter",
  tg: "Telegram",
  geekjob: "GeekJob",
  jobicy: "Jobicy",
  weworkremotely: "We Work Remotely",
  rabota: "Работа.ру",
  flru: "FL.ru",
  kwork: "Kwork",
};

const FREELANCE_SOURCES = new Set(["flru", "kwork"]);

/**
 * Что вообще можно считать подработкой.
 *
 * Фриланс-заказы отсеиваются всегда: у них нет ни занятости, ни графика, и
 * человек пришёл за подработкой, а не за разовым заказом. Считать заказ
 * подработкой — подмена предмета.
 */
const SIDEGIG_SOURCES = new Set(["hh", "trudvsem", "geekjob", "rabota"]);

function textOf(v: Vacancy): string {
  return [v.title, v.about, v.category, ...(v.requirements ?? []), ...(v.responsibilities ?? [])].join(" ");
}

function toGig(v: Vacancy): Gig {
  const freelance = FREELANCE_SOURCES.has(v.source);
  const text = textOf(v);
  const direction = detectDirection(v.category, v.title, text);
  const mode = detectWorkMode(text, freelance);
  return {
    slug: v.slug,
    title: v.title,
    company: v.company,
    city: v.city,
    level: v.level,
    format: v.format,
    posted: v.posted,
    category: v.category,
    source: v.source,
    sourceLabel: SOURCE_LABELS_LOCAL[v.source] ?? v.source,
    sourceUrl: v.source_url,
    direction,
    directionLabel: DIRECTION_LABELS[direction],
    mode,
    manual: v.source !== "hh",
  };
}

/**
 * Подбор заказов.
 *
 * Порядок по умолчанию — свежие сверху. Список короткий по определению: в нём
 * только то, что человек сам искал бы руками, поэтому сортировка по дате важнее
 * сортировки по «релевантности», которой здесь неоткуда взяться.
 */
export function findGigs(filter: GigFilter = {}): Gig[] {
  const limit = Math.min(Math.max(1, filter.limit ?? 40), 200);
  const wantedMode = filter.mode;
  const wantedDirection = filter.direction;
  const wantedLevel = filter.level;

  const out: Gig[] = [];
  for (const v of getCatalog()) {
    if (wantedMode) {
      // Заказ и подработка — разные вещи, и подменять одно другим нельзя.
      if (wantedMode === "подработка" && !SIDEGIG_SOURCES.has(v.source)) continue;
      /*
       * Для фриланса отдельной проверки источника нет: у hh режим не бывает
       * «фриланс», поэтому его отсекает проверка режима ниже. Дублирующее правило
       * стояло здесь и было недостижимо — мутатор с его удалением это подтвердил.
       */
    }

    const g = toGig(v);
    if (wantedMode && wantedMode !== "подработка" && g.mode !== wantedMode) continue;
    if (wantedDirection && g.direction !== wantedDirection) continue;
    if (wantedLevel && g.level !== wantedLevel) continue;
    out.push(g);
  }

  out.sort((a, b) => {
    const pa = getVacancyDate(a.slug);
    const pb = getVacancyDate(b.slug);
    return pb - pa;
  });

  return out.slice(0, limit);
}

function getVacancyDate(slug: string): number {
  const row = db.prepare("SELECT published_at FROM vacancies WHERE slug = ?").get(slug) as
    | { published_at: number | null }
    | undefined;
  return row?.published_at ?? 0;
}

/**
 * Сколько вообще нашлось — нужно для честной надписи «нашлось 4».
 *
 * Без неё пустой раздел выглядит как ошибка, а человек не отличит «ничего не
 * подошло под фильтр» от «сервис сломался».
 */
export function gigCounts(filter: GigFilter = {}): {
  подработка: number;
  фриланс: number;
  всего: number;
} {
  let podrabotka = 0;
  let freelance = 0;
  for (const v of getCatalog()) {
    if (FREELANCE_SOURCES.has(v.source)) freelance++;
    else if (SIDEGIG_SOURCES.has(v.source) && detectWorkMode(textOf(v)) === "подработка") podrabotka++;
  }
  const all = filter.direction || filter.level ? findGigs(filter).length : podrabotka + freelance;
  return { подработка: podrabotka, фриланс: freelance, всего: all };
}

/** Направления, за которые реально есть заказы — пустые разделы не показываем. */
export function availableDirections(mode?: WorkMode): { key: Direction; label: string; count: number }[] {
  const gigs = findGigs({ mode });
  const counts = new Map<Direction, number>();
  for (const g of gigs) counts.set(g.direction, (counts.get(g.direction) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([key]) => key !== "other" || (counts.get(key) ?? 0) >= 3)
    .map(([key, count]) => ({ key, label: DIRECTION_LABELS[key], count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Подписи для интерфейса — из одного места, чтобы бот и сайт говорили одно. */
export { DIRECTION_LABELS, WORK_MODE_LABELS };