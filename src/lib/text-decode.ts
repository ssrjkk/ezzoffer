/**
 * Распаковка HTML/XML-разметки в простой текст.
 *
 * Площадки отдают описания вакансий то настоящим HTML, то XML с сущностями, то
 * и тем и другим сразу. Раньше каждый провайдер делал это своим набором
 * `.replace()`, и порядок замен был неверный: `&amp;` распаковывался первым,
 * поэтому `&amp;lt;script&amp;gt;` превращался в `&lt;script&gt;`, а следующий
 * шаг разворачивал его уже в `<script>`. Два прохода по одной строке — это
 * двойная распаковка: текст, который кто-то записал как литерал, начинает жить
 * как разметка.
 *
 * Здесь распаковка всегда один проход: вся строка сканируется одной регуляркой,
 * найденная сущность заменяется по таблице, результат больше не читается как
 * вход. Порядок дальше тоже фиксирован: сначала распаковка, потом вырезание
 * тегов — так разметка, проставленная сущностями, тоже исчезает, а не остаётся.
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  shy: '',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  times: '×',
  divide: '÷',
  euro: '€',
  pound: '£',
  larr: '←',
  rarr: '→',
};

/** Одна распаковка: каждая сущность считается ровно один раз. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,9});?/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1].toLowerCase() === 'x';
      const codePoint = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      // Невалидный или не-скалярный код остаётся как есть: молча подменять его
      // на «?» значит портить текст, который может быть адресом или цитатой.
      if (!Number.isFinite(codePoint) || codePoint < 1 || codePoint > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/** Теги вырезаются, незакрытый хвост (`<div` без `>`) тоже не остаётся. */
function stripTags(value: string): string {
  let text = value.replace(/<[^>]*>/g, ' ');
  const open = text.lastIndexOf('<');
  const close = text.lastIndexOf('>');
  if (open > close) text = text.slice(0, open);
  return text;
}

/** HTML/XML → одна строка plain text. */
export function htmlToText(value: string): string {
  const withoutCdata = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return stripTags(decodeEntities(withoutCdata)).replace(/\s+/g, ' ').trim();
}
