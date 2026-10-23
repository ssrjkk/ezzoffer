import { htmlToText } from '../text-decode';
export function sanitizeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return trimmed;
  } catch {
    /* невалидный URL */
  }
  return null;
}

export function toSalaryNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[\s\u00A0]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Распаковка MongoDB extended JSON (источники вроде GeekJob отдают числа
 * как {"$numberLong":"..."} / {"$date":{"$numberLong":"..."}}).
 */
export function unwrapExtended(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.$numberLong === 'string') return Number(v.$numberLong);
    if (typeof v.$numberInt === 'string') return Number(v.$numberInt);
    if (v.$date && typeof v.$date === 'object') {
      const inner = (v.$date as Record<string, unknown>).$numberLong;
      if (typeof inner === 'string') return Number(inner);
    }
    if (typeof v.$numberDouble === 'string') return Number(v.$numberDouble);
  }
  return value;
}

function numToSalary(v: unknown): number | null {
  const n = toSalaryNumber(v as number | string | null);
  if (n != null) return n;
  if (typeof v === 'string' && /K|k|M/i.test(v)) {
    const m = v.match(/^([\d.\s]+)\s*([KkMm])$/);
    if (m) {
      const base = Number(m[1].replace(/[\s\u00A0]/g, ''));
      if (Number.isFinite(base) && base > 0) {
        return Math.round(base * (/m/i.test(m[2]) ? 1_000_000 : 1_000));
      }
    }
  }
  return null;
}

function formatN(n: number): string {
  return n.toLocaleString('ru-RU').replace(/\u00A0/g, ' ');
}

/**
 * Курс к рублю для сравнения зарплат.
 *
 * salary_min/max во всей системе — это РУБЛИ В МЕСЯЦ. Провайдеры отдают
 * кто во что (hh — RUR/USD/EUR/KZT, jobicy/remoteok — USD, trudvsem — RUB),
 * и сравнение «USD 3000 против ожиданий 150 000» без конвертации либо
 * прятало хорошие вакансии, либо завышало им оценку. Конвертация идёт здесь,
 * на границе парсинга, а не в скорингах: все потребители уже говорят в рублях.
 *
 * Курсы грубые и только для фильтра/ранжирования, а не для выплат.
 * Неизвестная валюта считается рублём: лучше показать вакансию, чем спрятать.
 */
const RUB_PER_UNIT: Record<string, number> = {
  '₽': 1,
  RUB: 1,
  RUR: 1,
  'РУБ': 1,
  '$': 90,
  USD: 90,
  '€': 98,
  EUR: 98,
  '£': 115,
  GBP: 115,
  '₸': 0.2,
  KZT: 0.2,
  'ZŁ': 23,
  'ZŁOTY': 23,
  PLN: 23,
  '₺': 2.7,
  TRY: 2.7,
  BYN: 28,
  UAH: 2.2,
  AZN: 53,
  GEL: 33,
  KGS: 1.04,
  UZS: 0.007,
  AMD: 0.23,
};

function rubRate(currency: string | null | undefined): number {
  if (!currency) return 1;
  const key = currency.trim().replace(/\.$/, '').toUpperCase();
  return RUB_PER_UNIT[key] ?? RUB_PER_UNIT[currency.trim()] ?? 1;
}

/** Сумма в своей валюте → рубли. null проходит транзитом. */
export function toRub(amount: number | null | undefined, currency?: string | null): number | null {
  if (amount == null) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * rubRate(currency));
}

/**
 * Период выплаты → месячная сумма.
 *
 * Часть площадок отдаёт годовые или часовые ставки (jobicy — salaryPeriod,
 * rabota — unitText). Без нормализации $120 000/год сравнивались с ожиданиями
 * «в месяц» как 120 000/мес — в 12 раз выше правды. Неизвестный период
 * считается месячным намеренно: делить на 12 «на всякий случай» прятало бы
 * вакансии, а завышение лишь поднимает их в выдаче — ошибка в безопасную
 * сторону (вакансию видно, фильтр её не выкидывает молча).
 */
export function periodToMonthly(
  amount: number | null | undefined,
  period?: string | null,
): number | null {
  if (amount == null) return null;
  const p = (period ?? '').trim().toLowerCase();
  if (!p) return amount;
  if (/hour|час/.test(p)) return Math.round(amount * 160);
  if (/day|день|дня|сут/.test(p)) return Math.round(amount * 22);
  if (/week|нед/.test(p)) return Math.round(amount * 4.33);
  if (/year|annual|год/.test(p)) return Math.round(amount / 12);
  return amount;
}

/**
 * Полная нормализация одной суммой: валюта → рубли, период → месяц.
 *
 * Порядок намеренный: сначала курс (точный для круглых ставок), потом период.
 * Наоборот давало бы 100 000 $/год → 8 333 $/мес → 749 970 ₽ вместо 750 000 ₽:
 * промежуточное округление съедало 30 ₽ на каждой вакансии.
 */
export function toRubMonthly(
  amount: number | null | undefined,
  currency?: string | null,
  period?: string | null,
): number | null {
  return periodToMonthly(toRub(amount, currency), period);
}

const CURRENCY_TABLE: Array<[RegExp, string]> = [
  [/\$|USD/i, '$'],
  [/€|EUR/i, '€'],
  [/£|GBP/i, '£'],
  [/zł|PLN/i, 'zł'],
  [/₺|TRY/i, '₺'],
  [/₸|KZT/i, '₸'],
];

/** Определение символа валюты по тексту зарплаты (например, «1 800-2 500 $»). */
function detectCurrency(raw: string, fallback: string): string {
  for (const [re, symbol] of CURRENCY_TABLE) {
    if (re.test(raw)) return symbol;
  }
  return fallback;
}

/**
 * Парсинг свободной строки зарплаты вида «200K — 230K ₽» или «от 100 000 ₽».
 *
 * salary_min/max в результате — РУБЛИ В МЕСЯЦ (см. toRub): сравнение идёт
 * в одной валюте, а строка display хранит исходный вид для честности показа.
 *
 * Правила приёма числа (раньше бралось ЛЮБОЕ число из текста: «команда из 5
 * человек» давала min=5, «опыт 2026 года» — min=2026, а пара «5–200 000 ₽»
 * показывалась как диапазон):
 *  - одиночка — свой маркер (валюта рядом, «от»/«до», K/M) или ≥ 10 000;
 *  - пара через разделитель (–, —, -, /, «до», to) — каждая часть со своим
 *    маркером или ≥ 1 000, плюс маркер где-то в строке или обе части ≥ 10 000.
 * Годы и размеры команд этим правилам не удовлетворяют и отбрасываются, а
 * «1 800-2 500 $» проходит: части ≥ 1 000 и $ в строке.
 */
export function parseSalaryText(
  text: string | null | undefined,
  currencySymbol = '₽',
): { display: string; min: number | null; max: number | null } {
  const raw = (text ?? '').trim().replace(/\u00A0/g, ' ');
  if (!raw) return { display: 'по договорённости', min: null, max: null };
  const symbol = detectCurrency(raw, currencySymbol);
  const rate = rubRate(symbol);
  const stringMarked =
    /(от|до|up\s*to|₽|руб\.?|\$|€|£|zł|₺|₸|USD|EUR|GBP|KZT|PLN|TRY|BYN|UAH|RUR|RUB|[KkMm]\b)/i.test(
      raw,
    );

  const CUR = String.raw`₽|руб\.?|\$|€|£|zł|₺|₸|USD|EUR|GBP|KZT|PLN|TRY|BYN|UAH|RUR|RUB`;
  const tokRe = new RegExp(
    String.raw`(?<lead>CUR)?\s*(?<pre>от|до|up\s*to)?\s*(?<num>\d[\d\s.]*)\s*(?<k>[KkMm])?\s*(?<post>CUR)?`.replaceAll(
      'CUR',
      CUR,
    ),
    'gi',
  );
  type Tok = { raw: number; norm: number; marked: boolean; start: number; end: number };
  const toks: Tok[] = [];
  for (const m of raw.matchAll(tokRe)) {
    const num = m.groups?.['num'] ?? '';
    if (!num.trim()) continue;
    const n = numToSalary(`${num.replace(/\s/g, '')}${m.groups?.['k'] ?? ''}`);
    if (n == null) continue;
    toks.push({
      raw: n,
      norm: Math.round(n * rate),
      marked: Boolean(m.groups?.['lead'] || m.groups?.['pre'] || m.groups?.['k'] || m.groups?.['post']),
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    });
  }

  // Пара через разделитель: «1 800-2 500 $», «150 000 ₽ до 200 000 ₽».
  const SEP_RE = /^\s*(?:[–—\-−~\/]|до|to)\s*$/i;
  const paired = new Set<number>();
  for (let i = 1; i < toks.length; i++) {
    const gap = raw.slice(toks[i - 1]!.end, toks[i]!.start);
    if (!SEP_RE.test(gap)) continue;
    const a = toks[i - 1]!;
    const b = toks[i]!;
    const partsOk =
      (a.marked || a.raw >= 1000) && (b.marked || b.raw >= 1000);
    if (!partsOk) continue;
    if (!stringMarked && (a.raw < 10_000 || b.raw < 10_000)) continue;
    paired.add(i - 1);
    paired.add(i);
  }

  const accepted = toks.filter(
    (t, i) => paired.has(i) || t.marked || t.raw >= 10_000,
  );
  const seen = new Set<string>();
  const deduped = accepted.filter((p) => {
    const k = `${p.raw}/${p.norm}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (deduped.length >= 2) {
    const first = deduped[0]!;
    const last = deduped[deduped.length - 1]!;
    const min = Math.min(...deduped.map((p) => p.norm));
    const max = Math.max(...deduped.map((p) => p.norm));
    const dMin = Math.min(first.raw, last.raw);
    const dMax = Math.max(first.raw, last.raw);
    return { display: `${formatN(dMin)}–${formatN(dMax)} ${symbol}`, min, max };
  }
  if (deduped.length === 1) {
    const p = deduped[0]!;
    const prefix = /(до|up\s*to)/i.test(raw) ? 'до ' : 'от ';
    return {
      display: `${prefix}${formatN(p.raw)} ${symbol}`,
      min: prefix === 'от ' ? p.norm : null,
      max: prefix === 'до ' ? p.norm : null,
    };
  }
  return { display: raw, min: null, max: null };
}

export function cleanHtml(value: string): string {
  return htmlToText(value);
}
