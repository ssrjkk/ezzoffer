/**
 * Даты для интерфейса — всегда по Москве.
 *
 * Клиентские компоненты рендерятся и на сервере (SSR), и в браузере. Без явной
 * timeZone сервер в UTC отдавал «14:05», клиент в Москве считал «17:05» —
 * текст расходился при гидрации, React 19 писал ошибку и перерисовывал узел.
 * Явная Europe/Moscow убирает вопрос целиком: везде одно и то же время.
 */

const TZ = 'Europe/Moscow';

export function formatDateTime(ts: number | string): string {
  return new Date(ts).toLocaleString('ru-RU', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Коротко, без года — для строк таблиц, где год и так понятен из контекста. */
export function formatShortDateTime(ts: number | string): string {
  return new Date(ts).toLocaleString('ru-RU', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(ts: number | string): string {
  return new Date(ts).toLocaleDateString('ru-RU', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateShort(ts: number | string): string {
  return new Date(ts).toLocaleDateString('ru-RU', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
  });
}

/**
 * «Сегодня/завтра/дата» — по московскому календарю.
 *
 * Старый код сравнивал toDateString() в локальной зоне процесса: сервер в UTC
 * и клиент в Москве видели разные «сегодня» около полуночи, и текст прыгал
 * при гидрации.
 */
export function formatRelativeDay(ts: number, nowMs: number = Date.now()): string {
  const dayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const day = dayFmt.format(new Date(ts));
  const today = dayFmt.format(new Date(nowMs));
  const tomorrow = dayFmt.format(new Date(nowMs + 86_400_000));
  const time = new Date(ts).toLocaleTimeString('ru-RU', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
  if (day === today) return `сегодня в ${time}`;
  if (day === tomorrow) return `завтра в ${time}`;
  const long = new Date(ts).toLocaleDateString('ru-RU', {
    timeZone: TZ,
    day: 'numeric',
    month: 'long',
  });
  return `${long}, ${time}`;
}
