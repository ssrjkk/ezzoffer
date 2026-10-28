/**
 * Конфигурация лимитов из env.
 * Глобальные мягкие лимиты позволяют администратору удерживать объём автооткликов
 * ниже порогов платформ, снижая риск блокировок.
 */

/**
 * Число из окружения.
 *
 * Ноль — допустимое значение, и раньше он молча заменялся значением по
 * умолчанию, потому что проверка была `n > 0`. Из-за этого нельзя было задать
 * `AUTOAPPLY_WORK_START=0` (полночь как начало рабочего дня превращалась в 9) и
 * `AUTOAPPLY_MIN_INTERVAL_SEC=0` (нулевая пауза превращалась в 45 секунд) —
 * администратор задавал переменную и получал другое поведение без ошибки.
 *
 * «Не задано» и «задано нулём» — разные вещи, поэтому пустая строка и
 * undefined отделяются от числа, а ноль пропускается.
 */
function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function globalDailyCap(): number {
  return num(process.env.AUTOAPPLY_DAILY_CAP, 0); // 0 = без глобального потолка
}

export function globalHourlyCap(): number {
  return num(process.env.AUTOAPPLY_HOURLY_CAP, 12);
}

/**
 * Глобальные рубильники автооткликов.
 *
 * AUTOAPPLY_ENABLED=0 — полная остановка отправки (планировщик и ручные
 * запуски отвечают «выключено», ничего не трогая). Нужен, чтобы остановить
 * сервис одним флагом, а не выключением поиска за поиском.
 *
 * AUTOAPPLY_DRY_RUN=1 — холостой прогон: подбор, ранжирование и письма идут
 * как обычно, но вместо POST в hh пишется отметка dry_run. Нужен для
 * проверки логики на живых данных без внешних эффектов. Историю откликов не
 * трогает: фиктивные строки в applications врали бы воронке.
 */
export function autoapplyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AUTOAPPLY_ENABLED !== '0';
}

export function autoapplyDryRun(env: Record<string, string | undefined> = process.env): boolean {
  return env.AUTOAPPLY_DRY_RUN === '1';
}

/** Минимальный интервал между откликами, секунды. */
export function minApplyIntervalSec(): number {
  return num(process.env.AUTOAPPLY_MIN_INTERVAL_SEC, 45);
}

/** Максимальный интервал между откликами, секунды. */
export function maxApplyIntervalSec(): number {
  return num(process.env.AUTOAPPLY_MAX_INTERVAL_SEC, 180);
}

/** Часы работы локально (0-23). */
export function workStartHour(): number {
  const n = num(process.env.AUTOAPPLY_WORK_START, 9);
  return Math.min(23, Math.max(0, Math.round(n)));
}

export function workEndHour(): number {
  const n = num(process.env.AUTOAPPLY_WORK_END, 20);
  return Math.min(24, Math.max(1, Math.round(n)));
}

/**
 * Вероятность длинного перерыва после отправки (0–1). 0 — выключено.
 *
 * Дефолт выключен не потому, что перерывы не нужны, а потому, что это
 * политика объёма: её включает деплой (.env, compose), а не код. Тесты и
 * локальная разработка идут без искусственных пауз.
 */
export function longBreakChance(): number {
  const raw = process.env.AUTOAPPLY_LONG_BREAK_CHANCE;
  if (raw === undefined || raw.trim() === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Границы длинного перерыва, секунды. Перепутанные min/max схлопываются сами. */
export function longBreakMinSec(): number {
  return Math.max(0, num(process.env.AUTOAPPLY_LONG_BREAK_MIN_SEC, 900));
}

export function longBreakMaxSec(): number {
  return Math.max(0, num(process.env.AUTOAPPLY_LONG_BREAK_MAX_SEC, 2700));
}

/**
 * Множитель суточного лимита на выходных (0–1). 1 — выключено.
 *
 * Живой соискатель в выходные либо отдыхает, либо наоборот разбирает
 * накопившееся — но ровные будние объёмы семь дней в неделю без единого
 * спада выглядят машинными. 0.5 режет выходные вдвое, 0 оставляет дежурный
 * минимум в один отклик (полный ноль прятал бы причину остановки).
 */
export function weekendFactor(): number {
  const raw = process.env.AUTOAPPLY_WEEKEND_FACTOR;
  if (raw === undefined || raw.trim() === '') return 1;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

/**
 * Прогрев нового отправителя, дней. 0 — выключено.
 *
 * Свежий аккаунт, в первый же день упирающийся в полный дневной лимит, —
 * классический триггер ограничений: ни один живой человек так не начинает.
 * Прогрев растит доступный объём линейно от 1/warmupDays в день первой
 * отправки до полного к концу срока. Верх — 30 дней, дольше тянуть бессмысленно.
 */
export function warmupDays(): number {
  const raw = process.env.AUTOAPPLY_WARMUP_DAYS;
  if (raw === undefined || raw.trim() === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(30, Math.max(0, Math.floor(n)));
}

export type EffectivePacing = {
  dailyCap: number;
  hourlyCap: number;
  minDelayMs: number;
  maxDelayMs: number;
  workStartHour: number;
  workEndHour: number;
  /** Вероятность длинного перерыва после отправки (0–1). */
  longBreakChance: number;
  /** Границы длинного перерыва, мс. */
  longBreakMinMs: number;
  longBreakMaxMs: number;
};

/** Параметры паузинга с учётом глобальных мягких лимитов. */
export function effectivePacing(planDaily: number): EffectivePacing {
  const globalDaily = globalDailyCap();
  const dailyCap = globalDaily > 0 ? Math.min(planDaily, globalDaily) : planDaily;
  /*
   * Перепутанные MIN/MAX (300/60) численно схлопываются сами: base падает в
   * [max, min] при любом порядке, поэтому поведения-бага здесь нет. Инвариант
   * lo <= hi фиксируется явно ради читателей и будущей арифметики, которая
   * вправе полагаться на неотрицательность (max - min): молчаливое
   * самолечение сегодня — это ловушка для следующей правки.
   */
  const loSec = Math.min(minApplyIntervalSec(), maxApplyIntervalSec());
  const hiSec = Math.max(minApplyIntervalSec(), maxApplyIntervalSec());
  const loBreakSec = Math.min(longBreakMinSec(), longBreakMaxSec());
  const hiBreakSec = Math.max(longBreakMinSec(), longBreakMaxSec());
  return {
    dailyCap,
    hourlyCap: globalHourlyCap(),
    minDelayMs: loSec * 1000,
    maxDelayMs: hiSec * 1000,
    workStartHour: workStartHour(),
    workEndHour: workEndHour(),
    longBreakChance: longBreakChance(),
    longBreakMinMs: loBreakSec * 1000,
    longBreakMaxMs: hiBreakSec * 1000,
  };
}
