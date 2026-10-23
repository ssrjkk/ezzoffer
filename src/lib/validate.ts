/**
 * Идентификатор из адреса.
 *
 * Проверка идёт по форме, а не через Number: Number разбирает «1e3», «0x10»,
 * « 1 » и «1.0» и возвращает целое, поэтому проверка «isInteger && > 0» их
 * принимала. Идентификатор приходит из URL, и «/api/applications/1e3» должен
 * быть отказом, а не откликом № 1000.
 *
 * Всё, что не является обычной десятичной записью без нуля на конце, отклоняется.
 */
const PLAIN_POSITIVE_ID = /^[1-9]\d*$/;

export function parseParamId(value: string | undefined): number | null {
  if (typeof value !== 'string') return null;
  if (!PLAIN_POSITIVE_ID.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Нарушение уникальности: строка с таким ключом уже есть.
 *
 * better-sqlite3 различает подтипы: UNIQUE-индекс даёт
 * SQLITE_CONSTRAINT_UNIQUE, а PRIMARY KEY — SQLITE_CONSTRAINT_PRIMARYKEY
 * (поймано вживую: telegram_codes.code — PK, и ловля только UNIQUE пропускала
 * коллизию кодов наружу как 500). Оба означают «уже существует», поэтому
 * принимаются оба; FOREIGNKEY/NOTNULL — нет, это другие поломки.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  const code = (err as { code?: unknown }).code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
}

/**
 * Положительное число из тела запроса.
 *
 * Строго: только number и десятичная строка (пробелы-разделители допускаются:
 * «150 000» — естественный ввод зарплаты). Раньше здесь стоял голый Number(),
 * и он принимал всё, что приводится: `true` → 1, `[100]` → 100, `'0x64'` →
 * 100, `'1e5'` → 100000. Фильтр зарплаты от таких значений молча менялся на
 * мусор вместо отказа — контракт врал. Булевы значения, массивы, hex и
 * экспонента теперь отклоняются (null), как и положено нечислу.
 */
const PLAIN_POSITIVE_NUM = /^\d+(\.\d+)?$/;

export function toPositiveNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  if (typeof v === 'string') {
    const t = v.replace(/[\s\u00A0]/g, '');
    if (!PLAIN_POSITIVE_NUM.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function validateSalaryRange(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null && min > max) {
    return 'Минимальная зарплата не может быть больше максимальной';
  }
  return null;
}
