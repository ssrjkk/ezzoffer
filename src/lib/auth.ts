import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { db, getUserById, type User } from './db';

export { hashPassword, verifyPassword, needsRehash } from './password';

export const SESSION_COOKIE = 'ez_session';
const SESSION_DAYS = 30;
/*
 * Абсолютный потолок жизни цепочки сессий: 90 дней с создания.
 *
 * expires_at продлевается ротацией на каждом запросе, и без потолка активный
 * пользователь жил бы на одной цепочке вечно — украденный полгода назад токен
 * оставался бы живым, пока жертва заходит в кабинет. Потолок гасит цепочку:
 * дальше — новый вход с паролем.
 */
const SESSION_ABSOLUTE_DAYS = 90;
const SESSION_ABSOLUTE_MS = SESSION_ABSOLUTE_DAYS * 24 * 60 * 60 * 1000;

/** В БД лежит хеш, а не сам токен: копия файла не даёт готовых сессий. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Хеш одноразовых токенов (сброс пароля, подтверждение почты).
 *
 * Та же причина, что у сессий: открытый токен в БД — это готовая ссылка
 * «войти за жертву» для любого, кто прочитал файл или бэкап. 32 байта энтропии
 * делают sha256 без соли достаточным: перебор 2^256 невозможен, а радужные
 * таблицы на случайные токены не строятся.
 *
 * Шестизначные коды привязки Telegram сюда не входят: 10^6 вариантов
 * брутфорсится офлайн мгновенно при любом хеше без секрета, поэтому их
 * защищает короткий TTL (15 мин) и лимит 10 попыток в час на чат, а не хеш.
 */
export function hashOneTimeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Глобальная уборка просроченных записей.
 *
 * createSession чистит только сессии СВОЕГО пользователя, поэтому сессии
 * удалённых аккаунтов (и всех, кто просто не заходил) оставались в таблице
 * навсегда: таблица росла монотонно и никогда не сжималась. То же с
 * oauth_states — истёкшие state-токены копились после каждой неудачной
 * попытки подключения hh.ru.
 *
 * Периодический вызов (раз в час на процесс) убирает их пачками.
 */
let lastPurgeAt = 0;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export function purgeExpiredAuthRows(now = Date.now()): void {
  if (now - lastPurgeAt < PURGE_INTERVAL_MS) return;
  lastPurgeAt = now;
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  db.prepare(
    'DELETE FROM sessions WHERE created_at IS NOT NULL AND created_at <= ?',
  ).run(now - SESSION_ABSOLUTE_MS);
  db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').run(now);
}

/** Сброс для тестов: следующий вызов purgeExpiredAuthRows выполнит уборку. */
export function resetAuthPurge(): void {
  lastPurgeAt = 0;
}

export function createSession(userId: number): { token: string; expiresAt: number } {
  purgeExpiredAuthRows();
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?').run(userId, now);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    hashSessionToken(token),
    userId,
    expiresAt,
    now,
  );
  return { token, expiresAt };
}

export function destroySession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(hashSessionToken(token));
}

/*
 * HTTPS определяется по заголовку прокси только за доверенным прокси.
 *
 * Раньше `x-forwarded-proto: https` принимался безусловно. Заголовок ставит
 * любой, кто его пришлёт: при прямом соединении без прокси клиент сам себе
 * «включает» secure-флаг на сессионной cookie, и браузер перестаёт отдавать
 * её по HTTP — человек «вошёл», а следующий запрос уже без сессии. Это не
 * утечка, а самострел в доступность, но чинится тем же правилом, что и
 * clientIp в rate-limit: чужим заголовкам верим только при TRUST_PROXY=1.
 *
 * Без доверенного прокси остаётся протокол из URL запроса — то, что видит
 * сам сервер, а не то, что рассказал клиент.
 */
export function isHttpsRequest(request: Request): boolean {
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = request.headers.get('x-forwarded-proto') ?? '';
    if (forwarded.split(',')[0]?.trim() === 'https') return true;
  }
  return new URL(request.url).protocol === 'https:';
}

export function getSessionUser(token?: string): User | undefined {
  if (!token) return undefined;
  const key = hashSessionToken(token);
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(key) as
    { user_id: number; expires_at: number; created_at: number | null } | undefined;
  if (!session) return undefined;
  const now = Date.now();
  if (
    session.expires_at <= now ||
    (session.created_at != null && session.created_at + SESSION_ABSOLUTE_MS <= now)
  ) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(key);
    return undefined;
  }
  return getUserById(session.user_id);
}

export function rotateSession(token: string): { token: string; expiresAt: number } | null {
  const key = hashSessionToken(token);
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(key) as
    { user_id: number; expires_at: number; created_at: number | null } | undefined;
  if (!session || session.expires_at <= Date.now()) return null;
  if (session.created_at != null && session.created_at + SESSION_ABSOLUTE_MS <= Date.now()) {
    // Абсолютный потолок: цепочку не продлеваем, пусть человек войдёт заново.
    return null;
  }
  const newToken = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare('UPDATE sessions SET token = ?, expires_at = ? WHERE token = ?').run(
    hashSessionToken(newToken),
    expiresAt,
    key,
  );
  return { token: newToken, expiresAt };
}

export async function getCurrentUser(): Promise<User | undefined> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return getSessionUser(token);
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    plan_expires_at: user.plan_expires_at,
    trial_started_at: user.trial_started_at,
  };
}
