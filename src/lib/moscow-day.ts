/**
 * «Сегодня» по Москве, а не по серверу.
 *
 * Сервер в Docker живёт в UTC, а люди — в Москве. Старый код брал локальную
 * полночь сервера (setHours(0,0,0,0)), и дневной лимит с графиком переключались
 * в 03:00 МСК, а «рабочие часы» 9–20 превращались в 12:00–23:00. Москва без
 * перехода на летнее время — всегда UTC+3, поэтому полночь по Москве это
 * Date.UTC(день) − 3 часа. Считаем через календарь Europe/Moscow, а не через
 * таймзону процесса: так одинаково работает и в контейнере, и локально.
 */

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
export const DAY_MS = 86_400_000;
export { MSK_OFFSET_MS };

const mskDayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Начало текущих московских суток в мс эпохи. */
export function mskDayStartMs(nowMs: number = Date.now()): number {
  const parts = mskDayFmt.formatToParts(new Date(nowMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get('year'), get('month') - 1, get('day')) - MSK_OFFSET_MS;
}

/** Ключ московских суток (число суток с эпохи) — для GROUP BY в SQL. */
export function mskDayKey(ms: number): number {
  return Math.floor((ms + MSK_OFFSET_MS) / DAY_MS);
}
