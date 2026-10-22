import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { authMethod } from '../auth-methods';

/**
 * Механика внешнего входа.
 *
 * Три защиты, и каждая от своего:
 *
 * 1. `state` — одноразовый и привязан к пользователю. Без него работает
 *    login CSRF: злоумышленник отправляет жертве ссылку со своим кодом,
 *    жертва входит, и всё, что она делает дальше, достаётся ему.
 *
 * 2. Подпись ответа. Гироскоп Telegram подписывает значение, а не секрет
 *    приложения; GitHub и остальные доверяют HTTPS-каналу и токену. Здесь
 *    проверяется подпись там, где она есть, и не делается вид, что она
 *    есть там, где её нет.
 *
 * 3. Проверенная почта. Аккаунт на непроверенный адрес — это аккаунт, у
 *    которого письмо восстановления уйдёт туда же, и счёт можно угнать.
 *
 * Ни одна из проверок не «логируется как выполненная» без реального
 * сравнения: подпись сверяется за постоянное время, state удаляется после
 * первого использования.
 */

export type OAuthIdentity = {
  providerId: string;
  email: string;
  name: string;
  /** Подтверждена ли почта провайдером. */
  verified: boolean;
};

const SECRET_ENV = 'OAUTH_STATE_SECRET';

/*
 * Секрет подписи ответов Telegram. Пустого значения нет.
 *
 * Раньше здесь было `process.env[SECRET_ENV] ?? ""`, и пустая строка считалась
 * секретом. `createHmac("sha256", "")` не бросает — поэтому вход через Telegram
 * «работал» и без настроенного секрета. Но подпись с пустым ключом умеет
 * посчитать кто угодно: подделать `parseProviderResponse` мог любой, кто
 * прочитал этот файл. То есть защита от подделки существовала только у тех,
 * кто и так всё настроил, а у остальных вход был открыт нараспашку — и молча.
 *
 * Теперь без секрета вход закрыт: parseProviderResponse возвращает null, а
 * коллбэк отвечает 401 «провайдер не подтвердил вход». Это осознанно грубо:
 * лучше видимый отказ, чем невидимая дыра.
 */
function stateSecret(): string | null {
  const secret = (process.env[SECRET_ENV] ?? '').trim();
  return secret ? secret : null;
}

/** Живущие state, срок жизни короткий: код отправлен, на возврат есть минуты. */
const STATE_TTL_MS = 10 * 60 * 1000;

type StateStore = {
  prepare: (sql: string) => {
    get: (...args: unknown[]) => unknown;
    run: (...args: unknown[]) => { changes: number };
    all: (...args: unknown[]) => unknown[];
  };
};

let storeModule: { db: StateStore } | null = null;
/*
 * Состояние — в БД, а не в памяти процесса.
 *
 * Раньше коды жили в Map: возврат коллбэка на другой инстанс (или рестарт)
 * давал 401 на валидном входе — человек уходил к провайдеру и возвращался
 * ни с чем. Таблица oauth_states уже была (ею пользуется hh-flow), и теперь
 * ею же пользуется внешний вход: один паттерн на оба потока.
 *
 * Ленивый доступ — чтобы не тянуть открытие БД на импорт: db.ts при импорте
 * открывает файл, и eager-импорт здесь замыкал бы цикл через auth-methods.
 */
function stateStore(): StateStore {
  if (!storeModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    storeModule = require('../db') as { db: StateStore };
  }
  return storeModule.db;
}

function publicBase(): string {
  return (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/** Одноразовый код возврата. */
export function createState(userId: number): string {
  const nonce = randomBytes(16).toString('hex');
  const at = Date.now();
  /*
   * Подпись кода при возврате не проверяется — consumeState смотрит только в
   * серверную таблицу. Поэтому секрета здесь не требуется: код живёт лишь в
   * БД, и угадать 128 бит nonce снаружи нельзя. Секрет нужен для
   * ответов Telegram (parseProviderResponse ниже): они приходят снаружи, и
   * подпись — единственное, что их защищает.
   */
  const secret = stateSecret() ?? 'state-only';
  const mac = createHmac('sha256', secret).update(`${nonce}:${userId}:${at}`).digest('hex');
  const token = `${nonce}.${at}.${mac}`;
  const store = stateStore();
  store.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').run(at);
  store
    .prepare('INSERT INTO oauth_states (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, at + STATE_TTL_MS);
  return token;
}

/**
 * Кому принадлежит код — без его уничтожения.
 *
 * Нужно на коллбэке: сначала узнать пользователя, потом потребовать код.
 * Иначе нельзя было бы отличить «код для этого человека» от «код для
 * другого» до момента, когда код уже сгорел.
 */
export function peekStateUserId(token: string): number | null {
  if (!token) return null;
  const row = stateStore()
    .prepare('SELECT user_id, expires_at FROM oauth_states WHERE token = ?')
    .get(token) as { user_id: number; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    stateStore().prepare('DELETE FROM oauth_states WHERE token = ?').run(token);
    return null;
  }
  return row.user_id;
}

/**
 * Забрать код и уничтожить его. Второй раз вернёт null.
 *
 * Арбитр одноразовости — DELETE, а не SELECT: два одновременных возврата
 * увидят строку оба, но удалит её только один, второму достанется changes=0.
 */
export function consumeState(token: string): number | null {
  const userId = peekStateUserId(token);
  if (userId === null) return null;
  const res = stateStore().prepare('DELETE FROM oauth_states WHERE token = ?').run(token);
  return res.changes > 0 ? userId : null;
}

/** Только для тестов: сброс живых кодов между кейсами. */
export function resetStates(): void {
  stateStore().prepare('DELETE FROM oauth_states').run();
}

/**
 * Ссылка на авторизацию. `null`, если провайдер неизвестен или не настроен.
 *
 * Провайдер берётся из белого списка auth-methods, а не из параметра как
 * есть: иначе ?provider=https://evil.com уведёт человека с нашего домена.
 *
 * Способ без completes ссылку не строит: вести человека к провайдеру, когда
 * завершить вход нечем, — значит подарить ему 401 на возврате. См. completes
 * в auth-methods.ts.
 */
export function authorizeUrl(provider: string, state: string): string | null {
  const method = authMethod(provider);
  if (!method?.authorizeUrl || !method.env) return null;
  if (method.completes === false) return null;

  const clientId = process.env[method.env.id];
  if (!clientId) return null;

  const redirectUri = `${publicBase()}/api/auth/oauth/${provider}/callback`;
  const url = new URL(method.authorizeUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

/**
 * Разбор ответа провайдера с проверкой подписи.
 *
 * Только для Telegram: там подписывается само значение, и подпись
 * сверяется. Для GitHub/Google/Яндекса подписи в ответе нет — там доверяем
 * HTTPS-обмену токена, и этот разбор не вызывается.
 */
export function parseProviderResponse(provider: string, raw: string): OAuthIdentity | null {
  if (provider !== 'telegram') return null;

  /*
   * Без секрета проверять нечем — и отвечать «не подтверждено».
   *
   * Раньше подпись считалась пустым ключом, и подделать ответ мог кто угодно:
   * HMAC с известным (пустым) ключом — не защита. Закрыть вход здесь — значит
   * сломать его видимо (401 на коллбэке), а не оставить дыру тихо.
   */
  const secret = stateSecret();
  if (!secret) return null;

  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);

  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }

  const providerId = String(data.id ?? '');
  if (!providerId) return null;

  return {
    providerId,
    email: typeof data.email === 'string' ? data.email : '',
    /*
     * Отображаемое имя берётся из username, а не из поля name: username —
     * это то, за что человек отвечает в самом Telegram, а name прислал
     * внешний сервис и может содержать что угодно.
     */
    name: typeof data.username === 'string' ? data.username : '',
    verified: data.hash !== undefined,
  };
}

/** Подтверждена ли почта: пустой адрес не подтверждён ничем. */
export function emailVerifiedFrom(input: { email: string; verified: boolean }): boolean {
  return Boolean(input.email) && input.verified === true;
}
