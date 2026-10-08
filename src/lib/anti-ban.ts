/**
 * Анти-бан паузер для автооткликов.
 *
 * Реализует "человеческое" поведение, чтобы массовые отклики не выглядели как бот:
 *  - рабочие часы (по умолчанию 9:00–20:00), ночь — пауза;
 *  - суточный и часовой лимиты откликов;
 *  - случайная задержка между откликами (джиттер);
 *  - backoff после ошибок/отказов платформы;
 *  - экспоненциальная пауза при 429/403.
 *
 * Чистая функция-фабрика: состояние в замыкании, инжектируется now для тестов.
 */

export type PacingConfig = {
  dailyLimit: number;
  hourlyLimit: number;
  minDelayMs: number;
  maxDelayMs: number;
  /** Локальный час начала работы (0-23). */
  workStartHour: number;
  /** Локальный час окончания работы (0-23). */
  workEndHour: number;
  /** Минуты, округляем вниз к границе часа (защита от ровного ритма). */
  jitterMinutes: number;
};

export const DEFAULT_PACING: PacingConfig = {
  dailyLimit: 50,
  hourlyLimit: 12,
  minDelayMs: 45_000,
  maxDelayMs: 3 * 60_000,
  workStartHour: 9,
  workEndHour: 20,
  jitterMinutes: 3,
};

export type PaceDecision =
  | { allowed: true; delayMs: number }
  | { allowed: false; reason: "night" | "daily" | "hourly" | "backoff"; retryAfterMs: number };

export type Pacing = {
  decide(now?: number): PaceDecision;
  recordSent(now?: number): void;
  recordFailure(kind: "platform" | "network", now?: number): void;
  /** Обновляет лимиты на ходу: остаток дневного лимита меняется каждый тик. */
  configure(patch: Partial<PacingConfig>): void;
};

function startOfLocalHour(now: number, hour: number): number {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function hourFloor(now: number): number {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function dayFloor(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function createPacing(config: Partial<PacingConfig> = {}, nowFn: () => number = Date.now): Pacing {
  const cfg: PacingConfig = { ...DEFAULT_PACING, ...config };
  const sentTimestamps: number[] = [];
  let lastFailureAt = 0;
  let failureStreak = 0;
  /** Пауза до следующей отправки: реальный планировщик зовёт decide() один раз на тик. */
  let cooldownUntil = 0;
  /** Задержка, возвращённая последним разрешённым decide(); применяется в recordSent. */
  let pendingDelayMs = 0;

  const randomDelay = (): number => {
    const base = Math.round(cfg.minDelayMs + Math.random() * (cfg.maxDelayMs - cfg.minDelayMs));
    const jitter = Math.floor(Math.random() * (cfg.jitterMinutes + 1)) * 60_000;
    return base + jitter;
  };

  const nextBackoff = (): number => {
    // Экспоненциальный backoff: 5, 10, 20, 40… минут, с потолком 2 часа.
    const minutes = Math.min(120, 5 * 2 ** Math.min(failureStreak, 5));
    return minutes * 60_000;
  };

  return {
    configure(patch: Partial<PacingConfig>): void {
      Object.assign(cfg, patch);
    },

    decide(now = nowFn()): PaceDecision {
      const t = now;

      // Выдержка после предыдущей отправки внутри того же процесса.
      if (cooldownUntil > t) {
        return { allowed: false, reason: "backoff", retryAfterMs: cooldownUntil - t };
      }

      // Ночь: пауза до начала рабочего дня.
      const hour = new Date(t).getHours();
      if (hour < cfg.workStartHour || hour >= cfg.workEndHour) {
        const start = startOfLocalHour(t, cfg.workStartHour);
        const retry = start <= t ? start + 24 * 60 * 60 * 1000 : start;
        return { allowed: false, reason: "night", retryAfterMs: retry - t };
      }

      // Backoff после серии ошибок платформы.
      if (lastFailureAt > 0 && t - lastFailureAt < nextBackoff()) {
        return { allowed: false, reason: "backoff", retryAfterMs: nextBackoff() - (t - lastFailureAt) };
      }

      // Часовой лимит.
      const hourStart = hourFloor(t);
      const hourlyUsed = sentTimestamps.filter((ts) => ts >= hourStart).length;
      if (hourlyUsed >= cfg.hourlyLimit) {
        const nextHour = hourStart + 60 * 60 * 1000;
        return { allowed: false, reason: "hourly", retryAfterMs: nextHour - t };
      }

      // Суточный лимит.
      const dayStart = dayFloor(t);
      const dailyUsed = sentTimestamps.filter((ts) => ts >= dayStart).length;
      if (dailyUsed >= cfg.dailyLimit) {
        const nextDay = dayStart + 24 * 60 * 60 * 1000;
        return { allowed: false, reason: "daily", retryAfterMs: nextDay - t };
      }

      // Джиттер-пауза между откликами. Вызывающий код обязан ждать delayMs
      // перед фактической отправкой — иначе паузы не существует.
      const delayMs = randomDelay();
      pendingDelayMs = delayMs;
      return { allowed: true, delayMs };
    },

    recordSent(now = nowFn()): void {
      sentTimestamps.push(now);
      cooldownUntil = now + pendingDelayMs;
      pendingDelayMs = 0;
      // Храним только последние 24 часа.
      const cutoff = now - 24 * 60 * 60 * 1000;
      for (let i = 0; i < sentTimestamps.length; i++) {
        if (sentTimestamps[i] < cutoff) {
          sentTimestamps.splice(i, 1);
          i--;
        }
      }
    },

    recordFailure(kind: "platform" | "network", now = nowFn()): void {
      if (kind === "platform") {
        lastFailureAt = now;
        failureStreak++;
      } else {
        // Сетевая ошибка не так опасна, но тоже засчитывается.
        lastFailureAt = now;
        failureStreak = Math.max(1, failureStreak);
      }
    },
  };
}

/** Тестовый хелпер: мгновенная пауза, без лимитов и задержек. */
export function zeroPacing(): Pacing {
  return {
    decide: () => ({ allowed: true, delayMs: 0 }),
    recordSent: () => undefined,
    recordFailure: () => undefined,
    configure: () => undefined,
  };
}