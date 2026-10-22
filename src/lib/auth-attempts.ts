import { db } from './db';

/**
 * Счётчики неудачных попыток — в БД, а не в памяти процесса.
 *
 * In-memory бакеты сбрасывались рестартом (деплой, OOM) и не делились между
 * инстансами: фактически защита жила только до первого рестарта. Здесь окно
 * и счётчик лежат в таблице auth_attempts, поэтому переживают и рестарт,
 * и второй процесс.
 *
 * Ключ — нормализованный email или IP: проверка идёт только на неуспехе,
 * верный пароль проходит всегда (см. login/route.ts), так что владельца
 * заблокировать нельзя, а подбор упирается в лимит на любом инстансе.
 */

export type AttemptLimit = { windowMs: number; max: number };

export function recordAuthFailure(
  key: string,
  { windowMs, max }: AttemptLimit,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const windowStart = now - windowMs;
  // Окно протухло — начинаем заново, иначе наращиваем. Одним statement,
  // чтобы два процесса не потеряли чужой инкремент.
  db.prepare(
    `INSERT INTO auth_attempts (key, count, window_start) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN auth_attempts.window_start <= ? THEN 1 ELSE auth_attempts.count + 1 END,
       window_start = CASE WHEN auth_attempts.window_start <= ? THEN ? ELSE auth_attempts.window_start END`,
  ).run(key, now, windowStart, windowStart, now);

  const row = db
    .prepare('SELECT count, window_start FROM auth_attempts WHERE key = ?')
    .get(key) as { count: number; window_start: number };
  if (row.count <= max) return { allowed: true, retryAfterSeconds: 0 };
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((row.window_start + windowMs - now) / 1000),
  );
  return { allowed: false, retryAfterSeconds };
}

/** Успех обнуляет счётчик: правильный пароль доказывает легитимность. */
export function clearAuthFailures(key: string): void {
  db.prepare('DELETE FROM auth_attempts WHERE key = ?').run(key);
}

/** Уборка протухших окон — чтобы таблица не росла монотонно. */
export function purgeAuthAttempts(now = Date.now()): number {
  // Окна длиннее суток не бывает: чистим всё старше часа с запасом.
  const res = db
    .prepare('DELETE FROM auth_attempts WHERE window_start <= ?')
    .run(now - 24 * 60 * 60 * 1000);
  return Number(res.changes);
}
