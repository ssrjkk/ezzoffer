export type RateLimitOptions = {
  windowMs?: number;
  max?: number;
};

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
  if (process.env.TRUST_PROXY === "1") {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || null;
    return request.headers.get("x-real-ip")?.trim() || null;
  }
  return null;
}