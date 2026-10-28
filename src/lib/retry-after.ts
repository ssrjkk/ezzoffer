/**
 * Retry-After для интерфейса: секунды из заголовка → человеческая фраза.
 *
 * Сервер лимитов (логин, консультации, заявки) отдаёт срок в заголовке
 * Retry-After, а клиентская форма показывала только текст ошибки без срока —
 * человек жал «Войти» снова и снова, получая тот же 429. Срок читается из
 * заголовка и превращается в «Попробуйте через 2 минуты».
 */

/** Секунды из заголовка Retry-After. Мусор и неположительное — null. */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value.trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  // Потолок — сутки: больше сервер не ставит, а «через 48 часов» не читается.
  return Math.min(Math.floor(n), 24 * 60 * 60);
}

function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

/** «через 20 секунд» / «через 2 минуты» / «через 1 час 5 минут». */
export function humanRetryDelay(totalSeconds: number): string {
  const s = Math.max(1, Math.floor(totalSeconds));
  if (s < 60) return `через ${s} ${plural(s, 'секунду', 'секунды', 'секунд')}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `через ${m} ${plural(m, 'минуту', 'минуты', 'минут')}`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = `${h} ${plural(h, 'час', 'часа', 'часов')}`;
  if (rest === 0) return `через ${hours}`;
  return `через ${hours} ${rest} ${plural(rest, 'минуту', 'минуты', 'минут')}`;
}
