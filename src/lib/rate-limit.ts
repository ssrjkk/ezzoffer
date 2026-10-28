export type RateLimitOptions = {
  windowMs?: number;
  max?: number;
};

/*
 * Однопроцессный лимитер: бакеты живут в памяти и сгорают при рестарте.
 *
 * Это осознанно: строгая защита от подбора лежит в auth-attempts (БД, один
 * statement, переживает рестарт и второй процесс), а здешние бакеты —
 * мягкое сглаживание темпа. После рестарта квота обновляется полностью;
 * от дублей отправок при этом держит outbox с уникальным индексом, а не
 * этот лимит. Горизонтальному масштабированию (два процесса) лимит
 * умножается на число инстансов — архитектура однопроцессная, см. scheduler.
 */

type Bucket = { timestamps: number[]; lastSeen: number };

type RateLimiterState = {
  buckets: Map<string, Bucket>;
  now: () => number;
};

export function createRateLimiter(): { check: typeof rateLimit } {
  const state: RateLimiterState = {
    buckets: new Map<string, Bucket>(),
    now: Date.now,
  };

  return { check: (key, options) => rateLimit(key, options, state) };
}

const defaultState: RateLimiterState = {
  buckets: new Map<string, Bucket>(),
  now: Date.now,
};

export function rateLimit(
  key: string,
  { windowMs = 15 * 60 * 1000, max = 10 }: RateLimitOptions = {},
  state: RateLimiterState = defaultState,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = state.now();
  let bucket = state.buckets.get(key);

  if (bucket) {
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
    bucket.lastSeen = now;
  } else {
    bucket = { timestamps: [], lastSeen: now };
  }

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    // Отклонённый запрос тоже должен сохранить очищенный бакет: иначе
    // просроченные метки остаются в памяти до следующего успешного запроса
    // и buckets-карта растёт без границ.
    state.buckets.set(key, bucket);
    cleanup(state);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.timestamps.push(now);
  bucket.timestamps = bucket.timestamps.slice(-max);
  state.buckets.set(key, bucket);
  cleanup(state);
  return { allowed: true, retryAfterSeconds: 0 };
}

/*
 * Сброс бакета. Нужен там, где успешное действие доказывает легитимность:
 * правильный пароль при входе означает, что попытки делал владелец, и
 * накопленный счётчик обязан обнулиться.
 *
 * Без сброса лимит входа работал как ловушка для живых людей: 10 входов за
 * 15 минут (несколько устройств, перевходы) — и владелец получал 429 на
 * собственном аккаунте. Атакующему сброс не помогает: чтобы сбросить чужой
 * бакет, нужен верный пароль, а с верным паролем подбирать уже нечего.
 */
export function resetRateLimit(key: string, state: RateLimiterState = defaultState): void {
  state.buckets.delete(key);
}

const MAX_BUCKETS = 10_000;
const EVICT_BATCH = 500;

function cleanup(state: RateLimiterState): void {
  if (state.buckets.size <= MAX_BUCKETS) return;
  const stale: [string, number][] = [];
  for (const [key, bucket] of state.buckets) stale.push([key, bucket.lastSeen]);
  stale.sort((a, b) => a[1] - b[1]);
  for (const [key] of stale.slice(0, Math.min(EVICT_BATCH, stale.length))) {
    state.buckets.delete(key);
  }
}

export function clientIp(request: Request): string | null {
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0]?.trim() || null;
    return request.headers.get('x-real-ip')?.trim() || null;
  }
  return null;
}

/**
 * Ключ rate-limit для клиента.
 *
 * Регрессии, которые здесь уже чинились:
 *  1) proxy.ts писал `clientIp(request) ?? "unknown"`. clientIp() возвращает
 *     null, если TRUST_PROXY не выставлен (а это дефолт) — значит ВСЕ запросы
 *     всех пользователей попадали в один бакет `api:unknown` с потолком 60
 *     запросов в минуту. На любом живом трафике сайт отдавал 429 всем подряд.
 *  2) ключ из хеша значения cookie `ez_session`. httpOnly запрещает читать
 *     cookie из JS, но не запрещает прислать произвольное значение в заголовке:
 *     небраузерный клиент получал новый бакет на каждый запрос простой подменой
 *     cookie. Весь потолок обходился полностью.
 *
 * Поэтому правило одно: доверяем только IP при доверенном прокси, иначе —
 * общий анонимный бакет. Значение cookie из заголовка ключом больше не
 * является: оно клиент-контролируемо и для лимитера ничего не доказывает.
 * Общий бакет делят все без IP, поэтому потолок у него заметно выше, чтобы
 * один клиент не выбивал квоту у всех остальных.
 */
export function rateLimitKey(request: Request, scope: string): string {
  const ip = clientIp(request);
  if (ip) return `${scope}:ip:${ip}`;

  return `${scope}:anon`;
}

/**
 * Лимит для анонимных запросов без доверенного IP и без сессии.
 *
 * Все такие запросы делят один бакет по построению, поэтому потолок должен
 * быть заметно выше, чем у identified-клиента: иначе один анонимный клиент
 * выбивает квоту у всех остальных (ровно тот баг, что был исправлен выше).
 */
export const ANONYMOUS_RATE_LIMIT: RateLimitOptions = {
  windowMs: 60_000,
  max: 600,
};
