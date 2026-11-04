/**
 * Дата публикации из текстовой или ISO-формы.
 *
 * Нужна отдельно от `posted` (строки «3 дн. назад»): возраст решает, стоит ли
 * тратить слот дневного лимита отклика на эту вакансию, а текст для этого
 * непригоден.
 *
 * Возвращает null, а не 0 и не текущее время. Разница принципиальна:
 *  - 0 читался бы как «опубликована в 1970 году» и отсекал бы всё;
 *  - текущее время выдавало бы за свежую вакансию, которой неделю, и
 *    автоотклик тратил бы лимит впустую.
 *
 * Неразобранная дата тоже null: неизвестный возраст должен приводить к
 * осторожному поведению (не отсекать), а не к уверенному.
 *
 * ## Русские форматы разбираются ДО Date.parse — это не стиль, а корректность
 *
 * `Date.parse('12.09.2026')` в Node возвращает 9 ДЕКАБРЯ: V8 читает точечную
 * запись по-американски (month.day.year). Для русского источника «03.04.2026»
 * означает 3 апреля, и «парсинг по умолчанию» молча переставлял месяц и день:
 * возраст вакансии считался неверно, фильтр свежести отсекал не то. Поэтому
 * запись с точками и русские названия месяцев разбираются здесь, до того,
 * как строка дойдёт до Date.parse.
 */
export function parsePublishedAt(value: string | number | null | undefined): number | null {
  if (value == null) return null;

  if (typeof value === 'number') {
    // Секунды или миллисекунды — определяем по величине.
    if (!Number.isFinite(value) || value <= 0) return null;
    return value > 1e11 ? Math.round(value) : Math.round(value * 1000);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Числовая строка (RSS иногда отдаёт epoch строкой).
  if (/^\d{9,13}$/.test(raw)) return parsePublishedAt(Number(raw));

  const rus = parseRusDate(raw);
  if (rus !== null) return rus;

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  // Дата из далёкого будущего — почти наверняка мусор в данных площадки.
  if (parsed > Date.now() + 86_400_000) return null;
  return parsed;
}

/**
 * Русские названия месяцев (родительный падеж — так их пишут площадки:
 * «28 сентября») и краткие формы. Именительный здесь не нужен: рядом всегда
 * стоит число дня.
 */
const RU_MONTHS: Record<string, number> = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
  янв: 0,
  фев: 1,
  мар: 2,
  апр: 3,
  июн: 5,
  июл: 6,
  авг: 7,
  сен: 8,
  окт: 9,
  ноя: 10,
  дек: 11,
};

/** Миллисекунды эпохи для «день.месяц.год»; будущая дата — мусор, не дата. */
function dateMs(year: number, month: number, day: number): number | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month, day);
  if (ms > Date.now() + 86_400_000) return null;
  return ms;
}

/** Русские текстовые («28 сентября») и точечные («03.04.2026») записи даты. */
function parseRusDate(raw: string): number | null {
  // «28 сентября 2026» — полный вид.
  let m = /^(\d{1,2})\s+([а-яё]+)\s+(\d{4})$/i.exec(raw);
  if (m) {
    const month = RU_MONTHS[m[2]!.toLowerCase()];
    if (month === undefined) return null;
    return dateMs(Number(m[3]), month, Number(m[1]));
  }

  /*
   * «28 сентября» — без года (GeekJob). Год выводится: текущий, если месяц
   * уже прошёл в этом году; иначе прошлый. Будущее внутри текущего месяца
   * отсекается в dateMs — публикация «завтра» это мусор, а не дата.
   */
  m = /^(\d{1,2})\s+([а-яё]+)$/i.exec(raw);
  if (m) {
    const month = RU_MONTHS[m[2]!.toLowerCase()];
    if (month === undefined) return null;
    const now = new Date();
    const year = month > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
    return dateMs(year, month, Number(m[1]));
  }

  // «03.04.2026» — день.месяц.год. До Date.parse не доходит: тот прочитал бы
  // это как 3-е число 4-го месяца наоборот (см. шапку модуля).
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  if (m) return dateMs(Number(m[3]), Number(m[2])! - 1, Number(m[1]));
  return null;
}

/**
 * Относительный текст «3 дн. назад» из даты.
 *
 * Обратная операция к parsePublishedAt: часть провайдеров отдаёт только
 * дату, а каталог хранит и текст для показа человеку.
 */
export function relativePosted(iso: string | number | null | undefined): string {
  const ms = parsePublishedAt(iso);
  if (ms === null) return 'дата неизвестна';

  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн. назад`;
  if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
  return new Date(ms).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
