import { db, type User } from './db';
import { mskDayStartMs, MSK_OFFSET_MS, DAY_MS } from './moscow-day';
import { isPlanActive, planDailyLimit } from './plans';
import { matchesSearch, skillsByVacancy, type SearchRow } from './matcher';
import { getCatalog } from './vacancies';
import { hhProvider } from './vacancies/hh';
import { getValidHhToken } from './hh-oauth';
import { createPacing, type FailureKind, type Pacing, type PacingConfig } from './anti-ban';
import { effectivePacing, autoapplyEnabled, autoapplyDryRun, weekendFactor, warmupDays } from './config';
import { notifyAccountBlocked, notifyHhTokenExpiredForUser, clearHhTokenWarning } from './telegram-digest';
import { renderLetterTemplate } from './cover-letter';
import { rankLettersForVacancy } from './ai-matching';
import { rankVacancies, bestResumeFor, type ResumeTarget } from './resume-targeting';
import { DEMO_MODE_MESSAGE, isLiveMode } from './user-mode';
import { claimSend, completeSend, sweepStaleOutbox } from './apply-outbox';
import type { Vacancy, VacancyApplyResult } from './vacancies/types';
import { isUniqueViolation } from './http';
import { logApplyEvent } from './apply-events';
import { logError, logInfo } from './logger';

/**
 * Реальный автоотклик: для каждого активного поиска находит подходящие вакансии
 * и отправляет отклики через hh.ru API от имени пользователя.
 *
 * Что изменилось и почему:
 *
 *  - ПИСЬМА. Раньше в `hhProvider.apply` уходило `message: undefined`, то есть
 *    письмо не отправлялось НИ ОДНОГО РАЗА, хотя API его поддерживает, весь
 *    раздел писем в кабинете написан, и на главной письма обещаны как
 *    отличие сервиса. Теперь письмо подбирается под конкретную вакансию.
 *  - ПОРЯДок. Раньше вакансии брались в порядке каталога, то есть отклик
 *    уходил на первую попавшуюся. Теперь — по скорингу под резюме, и пока
 *    есть выбор, лучшие вакансии расходуют лимит первыми.
 *  - КЭШ. Навыки вакансий считаются один раз на прогон, а не на каждую
 *    проверку.
 */

export type AutoApplyRun = {
  ran: boolean;
  reason?: string;
  searches: number;
  applied: number;
  failed: number;
  /**
   * Подходящие вакансии, на которые отклик не пошёл.
   *
   * Смешивает две разные причины, поэтому для устаревших есть отдельный счётчик
   * `stale`: «вакансия закрыта» и «вы уже откликались» требуют от человека
   * противоположных действий — первую надо исправлять настройкой возраста,
   * второе делать не нужно вовсе. В одной цифре это не различить, и человек
   * чинит несуществующую проблему.
   */
  skipped: number;
  /** Подходящие вакансии старше порога — отклик на них не отправлен намеренно. */
  stale: number;
  pausedFor: string | null;
  /**
   * Чем именно вызвана пауза — своими словами.
   *
   * Раньше в отчёте было только `pausedFor: "backoff"`, и панель писала
   * «платформа отклонила отклики». Это неправда в двух случаях: паузу мог
   * вызвать Retry-After от hh (то есть площадка сама сказала «не раньше») или
   * ограничение аккаунта. Человек читал неверную причину.
   */
  pausedDetail: string | null;
  pausedUsers: number;
  /** Аккаунты, остановленные ограничением hh. */
  blockedUsers: number;
  /** Отклики, к которым приложено письмо. */
  withLetter: number;
  /** Вакансии без подходящего письма — отправлены без него. */
  withoutLetter: number;
  /**
   * Аккаунты, остановленные демо-режимом.
   *
   * Отдельный счётчик, потому что иначе «ноль откликов» у demo-пользователя
   * неотличим от поломки. Человек, который не включил живой режим, должен
   * видеть именно это, а не «подходящих вакансий не было».
   */
  demoUsers: number;
  /**
   * Пользователи, у которых прогон упал с исключением.
   *
   * Отдельный счётчик по той же причине, что и `demoUsers`: «ноль откликов,
   * потому что у одного человека сломалось» и «ноль откликов, потому что
   * вакансий не было» — это разные ситуации с разными действиями, и без
   * этого счётчика обе выглядят одинаково.
   */
  erroredUsers: number;
  /**
   * Холостых отправок в dry-run: подбор и письма посчитаны, POST не было,
   * в историю ничего не записано. Без счётчика холостой прогон выглядел бы
   * как «всё хорошо, ноль откликов» — то есть как поломка.
   */
  dryRuns: number;
  /**
   * Лок потерян посреди прогона. Без флага отчёт врал бы «нет активных
   * поисков», хотя поиски были — работать дальше было нельзя, потому что
   * это уже чужой прогон.
   */
  lockLost: boolean;
};

/**
 * Предохранители длинного тика.
 *
 * Без них тик с большим лимитом (Эксперт, 250/день) слал бы сотни откликов
 * подряд и морил голодом фазы, идущие следом в том же тике: обновление
 * каталога, синхронизацию статусов, дайджесты. 15 отправок или 10 минут —
 * дальше продолжает следующий тик (неотправленное не теряется: выборка
 * идёт из БД, уже отправленное отсекается проверкой дубля).
 */
const MAX_SENDS_PER_TICK = 15;
const TICK_SEND_BUDGET_MS = 10 * 60_000;

/** Пауза между отправками внутри тика. Только для pacing-пауз, не для сети. */
function sleepMs(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Сколько откликов в день допустимо у одной компании.
 *
 * Несколько вакансий в одной компании — нормальный интерес, двадцать — нет.
 * Значение задаётся переменной окружения, потому что у разных поисков разная
 * специфика: в крупной компании несколько вакансий одного профиля обычны.
 */
function companyDailyCap(): number {
  const raw = process.env.AUTOAPPLY_PER_COMPANY;
  const n = raw === undefined || raw.trim() === '' ? 4 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 4;
}

/**
 * На сколько останавливаем отклики при 403.
 *
 * Длиннее, чем пауза anti-ban: ограничение держится часами, и короткая пауза
 * означала бы, что сервис полезет пробовать снова через несколько минут и
 * только добьёт аккаунт. Снимается либо временем, либо успешным откликом.
 */
const BLOCK_STOP_MS = 6 * 60 * 60 * 1000;

/** Ответ hh → вид отказа для паузера. */
export function toFailureKind(kind: NonNullable<VacancyApplyResult['kind']>): FailureKind {
  switch (kind) {
    case 'auth':
      return 'blocked';
    case 'rate_limit':
      return 'rate_limit';
    // Истёкший токен — это не ограничение аккаунта. Останавливать на шесть
    // часов нельзя: он лечится перепривязкой в кабинете за минуту.
    case 'token':
      return 'rate_limit';
    // «network» и «other» — таймаут, 5xx, невнятный код: про риск для
    // аккаунта они не говорят, поэтому пауза короткая.
    default:
      return 'network';
  }
}

export function blockedUntil(userId: number): number {
  const row = db
    .prepare('SELECT autoapply_blocked_until AS v FROM users WHERE id = ?')
    .get(userId) as { v: number | null } | undefined;
  const v = row?.v ?? 0;
  return v && v > Date.now() ? v : 0;
}

export function blockedReason(userId: number): string {
  const row = db
    .prepare('SELECT autoapply_block_reason AS v FROM users WHERE id = ?')
    .get(userId) as { v: string | null } | undefined;
  return row?.v ?? '';
}

function setBlockedUntil(userId: number, until: number, reason: string): void {
  db.prepare(
    `UPDATE users SET autoapply_blocked_until = ?, autoapply_block_reason = ? WHERE id = ?`,
  ).run(until, reason, userId);
}

function todayCount(userId: number): number {
  // Отозванные считаются: внешняя отправка уже состоялась, и слот дневного
  // лимита она съела. Иначе «отправить → отозвать → отправить» давал бы
  // бесконечные отклики мимо лимита.
  const start = mskDayStartMs();
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM applications WHERE user_id = ? AND sent_at >= ?')
    .get(userId, start) as { c: number };
  return row.c;
}

/** Момент первой в истории отправки пользователя. Нет отправок — null. */
export function firstApplySentAt(userId: number): number | null {
  const row = db
    .prepare('SELECT MIN(sent_at) AS v FROM applications WHERE user_id = ?')
    .get(userId) as { v: number | null } | undefined;
  return typeof row?.v === 'number' ? row.v : null;
}

/** День недели по Москве: 0 — воскресенье, 6 — суббота. */
export function mskWeekday(nowMs: number): number {
  return new Date(nowMs + MSK_OFFSET_MS).getUTCDay();
}

/**
 * Смягчение объёма на выходных.
 *
 * Ровные будние объёмы семь дней в неделю без единого спада выглядят
 * машинными. factor = 1 (дефолт env) — выключено. Внизу — дежурный минимум
 * в один отклик: полный ноль прятал бы причину остановки за «паузой».
 */
export function weekendScaledCap(cap: number, nowMs: number): number {
  const factor = weekendFactor();
  if (factor >= 1) return cap;
  const day = mskWeekday(nowMs);
  if (day !== 0 && day !== 6) return cap;
  return Math.max(1, Math.floor(cap * factor));
}

/**
 * Прогрев нового отправителя: линейный рост доступного объёма.
 *
 * Свежий аккаунт, в первый же день упирающийся в полный дневной лимит, —
 * классический триггер ограничений. Отсчёт — от первой реальной отправки
 * (поведенческий возраст, а не created_at: аккаунт мог год лежать без
 * единой отправки). days = 0 (дефолт env) — выключено. Нет отправок —
 * самый строгий режим: первая неделя начинается с 1/warmupDays объёма.
 */
export function warmupScaledCap(
  cap: number,
  firstSentAt: number | null,
  days: number,
  nowMs: number,
): number {
  if (days <= 0) return cap;
  const ageDays = firstSentAt === null ? 0 : Math.max(0, Math.floor((nowMs - firstSentAt) / DAY_MS));
  const factor = Math.min(1, (ageDays + 1) / days);
  return Math.max(1, Math.floor(cap * factor));
}

/**
 * Название компании — к единому виду для потолка «N откликов в день».
 *
 * Площадки пишут как попало: «ООО Ромашка», «Ромашка», «romashka llc». Точное
 * сравнение строк считало это разными компаниями, и потолок не срабатывал.
 */
export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/["«»„“]/g, '')
    .replace(/\b(ооо|оао|зао|пао|ао|ип|llc|ltd|inc|gmbh|bv|sas)\b\.?/gi, '')
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getActiveSearches(userId: number): SearchRow[] {
  return db
    .prepare('SELECT * FROM searches WHERE user_id = ? AND active = 1')
    .all(userId) as SearchRow[];
}

type LetterRow = { id: number; title: string; content: string };

function getLetters(userId: number): LetterRow[] {
  return db
    .prepare('SELECT id, title, content FROM letters WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as LetterRow[];
}

/**
 * Текст резюме пользователя — нужен, чтобы письмо опиралось на реальный опыт,
 * а не на шаблон. Берём последнее обновлённое.
 */
function getLatestResume(userId: number): { id: number; title: string; content: string } | null {
  const row = db
    .prepare(
      'SELECT id, title, content FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
    )
    .get(userId) as { id: number; title: string; content: string } | undefined;
  return row ?? null;
}

/**
 * Все резюме пользователя для подбора и назначения.
 *
 * Порядок — по обновлению, чтобы при полном равенстве совпадений выбор падал
 * на то, за которым человек работает сейчас, а не на случайно созданное
 * раньше. Совпадения считаются в resume-targeting по навыкам, а не здесь.
 *
 * Экспортируется, потому что подбор резюме нужен и планировщику, и боту: если
 * каждый напишет свой запрос, рано или поздно они разойдутся, и список в чате
 * перестанет совпадать с тем, что реально уходит.
 */
export function getUserResumes(userId: number): ResumeTarget[] {
  return db
    .prepare(
      'SELECT id, title, content, hh_id FROM resumes WHERE user_id = ? ORDER BY updated_at DESC, id DESC',
    )
    .all(userId) as ResumeTarget[];
}

/**
 * Паузер живёт в модульной памяти и переживает вызовы runAutoApply: иначе
 * часовой и суточный лимиты сбрасывались бы на каждом тике планировщика,
 * и AntiBan не ограничивал бы ничего. Ключ — id пользователя.
 */
const pacingByUser = new Map<number, Pacing>();

/** Паузер пользователя (экспортируется для тестов гидратации). */
export function pacingFor(userId: number, cfg: Partial<PacingConfig>, nowFn: () => number): Pacing {
  const existing = pacingByUser.get(userId);
  if (existing) return existing;
  const created = createPacing(cfg, nowFn);
  /*
   * Гидратация часового лимита после рестарта.
   *
   * Паузер живёт в памяти: после рестарта процесса часовые счётчики были
   * пустыми, и пользователь сразу получал полную часовую норму поверх уже
   * отправленного — до 12 откликов в минуту после каждого деплоя. Суточный
   * лимит так не страдает (считается из applications по запросу), а часовой
   * теперь поднимается оттуда же: последние 24 часа меток из applications.
   * recordSent с явным временем не трогает cooldown (pendingDelayMs = 0),
   * только пополняет окно — повторных пауз из прошлого не возникает.
   * Запрос один на жизнь процесса (паузер кэшируется выше), индекс
   * idx_applications_user_sent его покрывает.
   */
  try {
    const now = nowFn();
    const rows = db
      .prepare('SELECT sent_at FROM applications WHERE user_id = ? AND sent_at >= ?')
      .all(userId, now - 24 * 60 * 60 * 1000) as { sent_at: number }[];
    for (const r of rows) {
      if (Number.isFinite(r.sent_at)) created.recordSent(r.sent_at);
    }
  } catch {
    // Гидратация — best-effort: без неё поведение как раньше (пустое окно).
  }
  pacingByUser.set(userId, created);
  return created;
}

/** Сброс паузеров (используется в тестах). */
export function resetPacing(): void {
  pacingByUser.clear();
}

/**
 * Подбор письма под вакансию.
 *
 * Берём лучшее из сохранённых писем по совпадению навыков. Если подходящих
 * нет — подставляем вакансию и компанию в шаблон пользователя.
 *
 * Почему без LLM: `personalizeLetter` ходит в сеть с таймаутом 30 секунд на
 * КАЖДУЮ вакансию. Планировщик обрабатывает пользователей по очереди, и один
 * медленный отклик к LLM задержал бы весь цикл — включая отклики других
 * пользователей. В автоотклике письмо строим шаблоном (это мгновенно),
 * а генерацию через модель оставляем там, где человек смотрит на результат
 * и может подождать, — в кабинете.
 */
async function buildLetter(
  vacancy: Vacancy,
  letters: LetterRow[],
  resumeContent: string,
): Promise<{ text: string; letterId: number | null } | null> {
  if (letters.length > 0) {
    const ranked = rankLettersForVacancy(letters, vacancy);
    const best = ranked[0];
    // Письмо релевантно, только если пересекается с вакансией по навыкам.
    // Старого условия `score > 0` было мало: бонус за длину давал 5 очков
    // пустому письму, и на вакансию уходило чужое письмо без единого совпадения.
    if (best && best.overlap > 0) {
      // Плейсхолдеры рендерятся всегда — сохранённое письмо с {вакансия}
      // иначе уходило бы на hh как есть, с фигурными скобками.
      const text = renderLetterTemplate(best.content, vacancy).trim();
      if (text) return { text, letterId: best.id };
    }
  }

  const template = defaultLetterTemplate(resumeContent);
  const text = renderLetterTemplate(template, vacancy).trim();
  return text ? { text, letterId: null } : null;
}

/**
 * Шаблон письма по умолчанию.
 *
 * Из резюме берётся первая строка достижения с цифрой — именно она отвечает
 * на главный вопрос работодателя «почему вы», а «Здравствуйте, меня
 * заинтересовала ваша вакансия» не отвечает ни на что.
 */
function defaultLetterTemplate(resumeContent: string): string {
  const achievement = (resumeContent ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /\d/.test(l) && l.length > 20 && l.length < 300);

  const why = achievement
    ? `В последней работе: ${achievement}.`
    : 'Готов обсудить детали и показать релевантные примеры.';

  return (
    'Здравствуйте!\n\n' +
    'Меня заинтересовала вакансия {вакансия} в компании {компания} ({город}). ' +
    `${why}\n\n` +
    'Буду рад обсудить задачи и рассказать, как могу быть полезен.\n\n' +
    'С уважением'
  );
}

/**
 * Максимальный возраст вакансии для автоотклика.
 *
 * Два дня — не произвольное число. При лимите 50 откликов в сутки и паузах
 * 45–180 секунд весь дневной лимит расходуется примерно за полчаса-час. За
 * это время список вакансий устаревает, и часть записей к моменту отклика
 * уже закрыта.
 *
 * Потеря от отказа на закрытой вакансии двойная: тратится слот дневного
 * лимита (а он один на день) и включается backoff, который замедляет все
 * последующие отклики. Вакансия, которой два дня, ещё может быть открыта;
 * вакансия недельной давности — почти наверняка нет.
 */
const MAX_APPLY_AGE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Только вакансии, на которые ещё имеет смысл откликаться.
 *
 * Дата публикации неизвестна (площадка её не отдала) — вакансия пропускается:
 * сказать «свежая» без данных было бы предположением, а предположение здесь
 * стоит слота дневного лимита. Для источников без даты (RSS-фиды компаний)
 * это заметно консервативнее, но консервативно — правильно: лимит конечен.
 */
export function onlyFresh(
  vacancies: Vacancy[],
  now = Date.now(),
  maxAgeMs = MAX_APPLY_AGE_MS,
): Vacancy[] {
  return vacancies.filter((v) => {
    if (typeof v.published_at !== 'number') return false;
    const age = now - v.published_at;
    // Дата из будущего — мусор в данных площадки, а не свежая вакансия.
    if (age < 0) return false;
    return age <= maxAgeMs;
  });
}

export async function runAutoApply(opts?: {
  pacing?: Partial<PacingConfig>;
  now?: () => number;
  /**
   * Продление внешней блокировки. Вызывается раз на пользователя — чаще
   * не нужно: бюджет тика (10 минут) меньше TTL (30 минут) с запасом.
   * Вернул false — лок потерян, останавливаемся с частичным итогом, а не
   * продолжаем поверх чужого прогона.
   */
  heartbeat?: () => boolean;
}): Promise<AutoApplyRun> {
  const nowFn = opts?.now ?? (() => Date.now());
  /*
   * Столбцы явно, а не SELECT *: в цикле не нужны ни хеш пароля, ни токены
   * сброса/подтверждения почты. Раньше каждая итерация тика (раз в 60 секунд)
   * складывала в память процесса хеши паролей и одноразовые токены всех
   * пользователей — чувствительные данные там, где им нечего делать, плюс
   * лишний вес выборки. Список — ровно то, что читает тело цикла, getValidHhToken
   * и проверки тарифа/режима (см. User и использование user.* ниже).
   */
  const users = db
    .prepare(
      `SELECT id, plan, plan_expires_at, autoapply_paused, hh_token, hh_token_expires_at,
              hh_refresh_token, hh_resume_id, telegram_chat_id, mode
       FROM users`,
    )
    .all() as User[];
  let searches = 0;
  let applied = 0;
  let failed = 0;
  let skipped = 0;
  let staleTotal = 0;
  let ran = false;
  let pausedFor: string | null = null;
  let pausedDetail: string | null = null;
  let pausedUsers = 0;
  /** Аккаунты, которые hh ограничил: их отклики остановлены до снятия. */
  let blockedUsers = 0;
  let withLetter = 0;
  let withoutLetter = 0;
  let demoUsers = 0;
  /** Пользователи, у которых прогон упал целиком. Видно в отчёте. */
  let erroredUsers = 0;
  /** Лок потерян посреди прогона — дальше работать нельзя, итог частичный. */
  let lockLost = false;
  /** Холостых отправок в dry-run. В историю не пишутся — это не отклики. */
  let dryRuns = 0;
  const dryRun = autoapplyDryRun();
  /** Отправок в этом тике — предохранитель от вечного тика (см. выше). */
  let sentThisTick = 0;
  const tickStartMs = Date.now();
  if (!autoapplyEnabled()) {
    return {
      ran: false,
      reason: 'автоотклики выключены оператором (AUTOAPPLY_ENABLED=0)',
      searches,
      applied,
      failed,
      skipped,
      stale: staleTotal,
      pausedFor,
      pausedDetail,
      pausedUsers,
      blockedUsers,
      withLetter,
      withoutLetter,
      demoUsers,
      erroredUsers,
      dryRuns,
      lockLost,
    };
  }

  /*
   * Сборщик брошенных заявок — в начале каждого прогона.
   *
   * Процесс мог умереть между успешным POST и записью в applications: без
   * сборщика такая заявка висела бы в outbox вечно и блокировала бы повтор
   * (уникальный индекс), а человек видел бы «уже отправляется» навсегда.
   * Потерянные (без строки отклика) пишутся в журнал как expired: повторная
   * отправка безопасна — hh ответит already_applied.
   */
  for (const lost of sweepStaleOutbox(nowFn())) {
    if (lost.lost) {
      logApplyEvent(lost.userId, lost.jobSlug, 'expired', 'процесс умер до записи отклика');
    }
  }

  for (const user of users) {
    // Лок потерян посреди прогона (перехватили по TTL) — дальше работать
    // нельзя: это уже чужой прогон. Возвращаем частичный итог.
    if (opts?.heartbeat && !opts.heartbeat()) {
      lockLost = true;
      break;
    }
    /*
     * Демо-режим — единственная причина пропустить пользователя целиком.
     *
     * Проверка стоит выше тарифа и паузы намеренно: демо-режим не про лимит и
     * не про настройку, это решение человека, и оно должно быть видно в
     * отчёте, а не прятаться за формулировкой «нет активных поисков».
     *
     * Раньше этой строки не было вовсе — планировщик обходил всех, у кого
     * активный тариф, независимо от режима. Человек, который никогда не
     * включал живой режим, всё равно получал реальные отклики от своего имени.
     */
    if (!isLiveMode(user)) {
      if (isPlanActive(user)) demoUsers++;
      continue;
    }
    if (!isPlanActive(user)) continue;
    const limit = planDailyLimit(user.plan);
    if (limit <= 0) continue;

    // Пользователь поставил автоотклики на паузу.
    if (user.autoapply_paused) {
      pausedUsers++;
      continue;
    }

    /*
     * Аккаунт ограничен площадкой — не трогаем его до снятия ограничения.
     *
     * Без этой проверки каждый тик планировщика снова стучался бы в hh и снова
     * получал 403. Ограничение держится часами, и повторные попытки только
     * ухудшают положение аккаунта.
     */
    const stopUntil = blockedUntil(user.id);
    if (stopUntil > 0) {
      blockedUsers++;
      continue;
    }

    const activeSearches = getActiveSearches(user.id);
    if (activeSearches.length === 0) continue;
    ran = true;

    /*
     * Изоляция одного пользователя от остальных.
     *
     * Раньше тело цикла шло без try/catch, и любое исключение — от
     * getValidHhToken до похода в hh — выходило из runAutoApply целиком.
     * Дальше это ловил runScheduledJobs, который просто логировал, и
     * автоотклик не срабатывал НИ ДЛЯ КОГО: один человек с битым токеном,
     * недоступной сетью или испорченными данными глушил отклики всех
     * остальных. При этом в отчёте стояло «0 откликов» без единого слова о
     * причине — то есть выглядело как «вакансий нет».
     *
     * Теперь сбой одного пользователя учётная запись не трогает: он считается,
     * попадает в отчёт отдельной строкой и пишется в лог с его id.
     */
    try {
      const used = todayCount(user.id);
      const remaining = Math.max(0, limit - used);
      if (remaining <= 0) continue;

      // Анти-бан: суточный лимит = остаток от тарифа (с учётом глобального
      // потолка), часовой лимит и паузы — из конфигурации.
      const eff = effectivePacing(limit);
      /*
       * Человеческий профиль объёма: прогрев нового отправителя и смягчение
       * выходных. Оба множителя по умолчанию выключены (env) и включаются
       * деплоем; подробности — у хелперов выше. Дежурный минимум — 1: полный
       * ноль прятал бы причину остановки за generic-паузой.
       */
      let effectiveDaily = Math.min(remaining, eff.dailyCap);
      effectiveDaily = weekendScaledCap(effectiveDaily, nowFn());
      effectiveDaily = warmupScaledCap(effectiveDaily, firstApplySentAt(user.id), warmupDays(), nowFn());
      if (effectiveDaily <= 0) continue;
      // effectivePacing отдаёт hourlyCap, а PacingConfig ждёт hourlyLimit:
      // имена разные, и прямое spread-кладение effectivePacing в configure
      // оставляло часовой лимит дефолтным (12) при любом AUTOAPPLY_HOURLY_CAP.
      const base = {
        hourlyLimit: eff.hourlyCap,
        minDelayMs: eff.minDelayMs,
        maxDelayMs: eff.maxDelayMs,
        workStartHour: eff.workStartHour,
        workEndHour: eff.workEndHour,
        longBreakChance: eff.longBreakChance,
        longBreakMinMs: eff.longBreakMinMs,
        longBreakMaxMs: eff.longBreakMaxMs,
      };
      /*
       * Переданные извне паузы имеют приоритет над конфигурацией.
       *
       * Раньше здесь стояло `pacing.configure({ ...base, dailyLimit })` уже
       * ПОСЛЕ createPacing с opts.pacing — и configure делает Object.assign, то
       * есть затирал инъекцию значениями по умолчанию. Инъекция existла, была
       * задокументирована параметром opts.pacing и молча ничего не делала:
       * тест, который просил нулевую паузу, получал 45 секунд и мог проверить
       * только первый отклик за тик. Теперь явные значения побеждают.
       */
      const overrides = opts?.pacing ?? {};
      const pacing = opts?.pacing
        ? createPacing({ ...base, ...overrides, dailyLimit: effectiveDaily }, nowFn)
        : pacingFor(user.id, { ...base, dailyLimit: effectiveDaily }, nowFn);
      pacing.configure({ ...base, dailyLimit: effectiveDaily, ...overrides });

      const appliedSet = new Set<string>();
      // Устаревшие вакансии пересекаются между поисками: без этого множества
      // одна и та же мёртвая запись считалась бы в skipped столько раз,
      // сколько активных поисков у человека.
      const staleCounted = new Set<string>();
      /*
       * Резюме пользователя — все, а не одно.
       *
       * Раньше подбор шёл по последнему обновлённому резюме, а отправлялось
       * users.hh_resume_id. При нескольких резюме это расхождение становилось
       * системным: система выбирала вакансии под «Python», а уходило резюме
       * «React». Теперь на каждую вакансию резюме выбирается отдельно.
       *
       * Резюме, созданные вручную, отправлять нельзя — hh принимает свой id.
       * Они остаются в оценке и письме, но id отклика берётся из того резюме,
       * которое реально привязано к hh, либо из общего hh_resume_id.
       */
      const resumes = getUserResumes(user.id);
      const sendableResumes = resumes.filter((r) => r.hh_id);
      const fallbackResumeId = user.hh_resume_id?.trim() || null;
      // Отправлять имеет смысл, только если резюме на hh вообще есть: либо
      // привязанное к конкретному резюме, либо общее на уровне аккаунта.
      const anySendable = sendableResumes.length > 0 || fallbackResumeId !== null;
      /*
       * Токен берём только если есть куда отправлять. Раньше здесь стояло
       * `resumeId ? await getValidHhToken(user) : null` — без привязанного резюме
       * токен не трогали вовсе. Обращение к hh лишнее, когда отправлять нечего.
       */
      const token = anySendable ? ((await getValidHhToken(user))?.token ?? null) : null;

      const letters = getLetters(user.id);
      // Резюме для письма: последнее обновлённое, как и раньше. Письмо — это
      // текст, и тут важно совпадение с резюме человека, а не с вакансией.
      const primaryResume = getLatestResume(user.id);
      const primaryResumeText = primaryResume?.content ?? '';

      // Каталог и навыки — один раз на пользователя, а не на каждый поиск.
      const catalog = getCatalog();
      const skillsCache = skillsByVacancy(catalog);

      /*
       * Аккаунт ограничили площадкой.
       *
       * Один 403 означает, что продолжать нельзя: пока ограничение висит, каждый
       * следующий отклик только ухудшает положение. Поэтому цикл обрывается, а
       * причина сохраняется — иначе после перезапуска сервис снова пошёл бы
       * откликаться, не понимая, что вчера его остановили.
       */
      let blockedUser = false;
      let blockReason = '';
      /** Токен протух: 401 от hh, лечится перепривязкой, а не ожиданием. */
      let tokenExpiredUser = false;
      const blockedUntilCol = blockedUntil(user.id);
      /** Отклики за сегодня — для потолка на компанию. Собирается один раз. */
      let slugs: { job_slug: string; company: string }[] | null = null;
      const dayStartMs = mskDayStartMs();

      for (const search of activeSearches) {
        if (appliedSet.size >= remaining) break;
        searches++;

        const candidates = catalog.filter(
          (v) => v.source === 'hh' && matchesSearch(v, search, skillsCache.get(v.slug)),
        );
        if (candidates.length === 0) continue;

        /*
         * Порядок отправки.
         *
         * Раньше вакансии шли в порядке каталога, то есть лимит расходовался на
         * первые попавшиеся, а не на подходящие. Здесь сортируем так, чтобы
         * раньше шли те, где пересечение с резюме больше: при лимите 50 в день
         * разница между «первые 50 из каталога» и «50 самых подходящих» — это
         * разница между откликами в пустоту и откликами в ответ.
         */
        const fresh = onlyFresh(candidates);
        const newlyStale = fresh.length === candidates.length
          ? []
          : candidates.filter((v) => !fresh.includes(v) && !staleCounted.has(v.slug));
        for (const v of newlyStale) staleCounted.add(v.slug);
        if (newlyStale.length > 0) {
          /*
           * Отдельно считаем пропущенные по устаревшим вакансиям: это не то же
           * самое, что «уже отправлено». Человек, у которого лимит расходуется
           * впустую на закрытые вакансии, должен видеть, сколько именно таких.
           */
          staleTotal += newlyStale.length;
          skipped += newlyStale.length;
        }
        if (fresh.length === 0) continue;

        /*
         * Порядок отправки и назначение резюме — одним проходом.
         *
         * Раньше сортировка шла по пересечению с ОДНИМ резюме (последним
         * обновлённым), и вакансия, идеально подходящая под второе резюме,
         * могла оказаться в конце списка просто потому, что с первым не
         * пересекалась. Теперь оценка берётся от лучшего подходящего резюме, то
         * есть отвечает на вопрос «насколько эта вакансия подходит кому-то из
         * моих резюме» — именно его человек и задаёт, заполняя несколько
         * резюме.
         *
         * Ранжировать только по отправляемым нельзя: ручное резюме без привязки к
         * hh годится для оценки, и его навыки должны влиять на порядок.
         */
        const ranked = rankVacancies(fresh, resumes.length > 0 ? resumes : [], skillsCache);

        for (const { vacancy, resume: picked } of ranked) {
          if (appliedSet.size >= remaining) break;
          if (appliedSet.has(vacancy.slug)) continue;

          /*
           * id резюме для отклика.
           *
           * Приоритет у привязанного резюме, подобранного под вакансию. Если
           * подходящего привязанного нет — берётся общее hh_resume_id: так
           * продолжают работать люди, у которых резюме заведено вручную и
           * привязка задана на уровне аккаунта.
           *
           * Резюме без привязки отправлять нельзя: hh принимает только свой id,
           * и подставлять локальный — значит отправлять мусор.
           */
          const sendableId = picked?.hh_id ?? fallbackResumeId;
          const canApply = hhProvider.canApply
            ? hhProvider.canApply(token, sendableId)
            : Boolean(token && sendableId);
          if (!canApply) {
            // Считаем только те вакансии этого поиска, которые ещё не отправлены
            // в этом прогоне. Раньше здесь стояло `skipped += candidates.length`:
            // список целиком учитывался для КАЖДОГО поиска, и уже отправленные
            // вакансии попадали в «пропущено» повторно — метрика раздувалась
            // в разы и показывала несуществующую проблему в статистике.
            skipped += ranked.filter((r) => !appliedSet.has(r.vacancy.slug)).length;
            break;
          }

          /*
           * Пауза после СОБСТВЕННЫХ отправок — ждём прямо в тике и повторяем
           * ТУ ЖЕ вакансию, а не рвём прогон.
           *
           * Раньше любой отказ останавливал пользователя до следующего тика:
           * при 5-минутном тике получался максимум ~12 откликов в час, и
           * тариф «Эксперт» (250/день) был физически недостижим — продукт
           * продавал то, что движок не мог выдать. Теперь темп задаёт
           * паузер (как задумано), а не расписание тиков: ждём только свою
           * паузу (backoff без detail — это cooldown после своих же
           * отправок). Чужая причина (detail от площадки), ночь,
           * часовой/суточный лимиты — по-прежнему остановка тика.
           *
           * `continue` здесь был бы багом: он переходил бы к следующей
           * вакансии, молча роняя текущую (ни applied, ни skipped, ни паузы
           * в отчёте). Повтор — через внутренний цикл по той же вакансии.
           *
           * Предохранители от вечного тика: не больше MAX_SENDS_PER_TICK
           * отправок и не дольше TICK_SEND_BUDGET_MS — иначе один прогон
           * морил бы голодом обновление каталога и синхронизацию, которые
           * идут в том же тике следом.
           *
           * Про delayMs из allowed-решения: ждать его ПЕРЕД отправкой здесь
           * нельзя — recordSent ставит такой же cooldown ПОСЛЕ, и интервал
           * между отправками удвоился бы. Пауза enforced один раз, после
           * отправки: интервал между откликами равен выданной паузе.
           *
           * Важно: паузер живёт на часах nowFn, а сон — на реальных. В
           * проде это одни и те же часы. В тестах с замороженным now
           * cooldown не истекает никогда — таким тестам нужен реальный now.
           */
          let gate: { allowed: true } | { allowed: false } | null = null;
          for (;;) {
            const decision = pacing.decide();
            if (decision.allowed) {
              gate = { allowed: true };
              break;
            }
            const selfCooldown =
              decision.reason === 'backoff' && !decision.detail && !dryRun;
            const budgetLeft = TICK_SEND_BUDGET_MS - (Date.now() - tickStartMs);
            if (
              selfCooldown &&
              sentThisTick < MAX_SENDS_PER_TICK &&
              budgetLeft > 0 &&
              decision.retryAfterMs <= budgetLeft
            ) {
              await sleepMs(decision.retryAfterMs);
              continue;
            }
            // Любой другой отказ останавливает пользователя до следующего тика.
            pausedFor = decision.reason;
            pausedDetail = decision.detail ?? null;
            gate = { allowed: false };
            break;
          }
          if (!gate.allowed) break;

          const already = db
            .prepare(
              'SELECT id FROM applications WHERE user_id = ? AND job_slug = ? AND withdrawn = 0',
            )
            .get(user.id, vacancy.slug);
          if (already) continue;

          if (!hhProvider.apply || !sendableId) break;

          /*
           * Потолок на одну компанию за день.
           *
           * Без него бывает так: у человека активный поиск по фронтенду, у
           * компании Авито двадцать подходящих вакансий, и двадцать откликов у
           * неё за день. Работодатель видит это в своей ленте, для площадки это
           * выглядит как аномалия, и под удар попадает аккаунт человека, а не
           * абстрактный «бот».
           *
           * Лимит небольшой и осмысленный: несколько вакансий в одной компании —
           * это нормальный интерес, двадцать — нет. Отклик переносится на завтра
           * сам, вакансия не теряется.
           */
          if (!slugs) {
            slugs = db
              .prepare(
                `SELECT a.job_slug AS job_slug, COALESCE(v.company, '') AS company
                 FROM applications a
                 LEFT JOIN vacancies v ON v.slug = a.job_slug
                 WHERE a.user_id = ? AND a.sent_at >= ?
                 ORDER BY a.sent_at DESC`,
              )
              .all(user.id, dayStartMs) as { job_slug: string; company: string }[];
          }
          const company = vacancy.company.trim();
          const cap = companyDailyCap();
          // cap = 0 отключает потолок — так же, как AUTOAPPLY_DAILY_CAP в этом
          // же сервисе: ноль означает «ограничения нет», а не «не отправлять».
          if (company && cap > 0) {
            const needle = normalizeCompany(company);
            const used = slugs.filter((r) => normalizeCompany(r.company) === needle).length;
            if (used >= cap) continue;
          }

          /*
           * Письмо.
           *
           * Раньше здесь было `message: undefined` — письмо не уходило никогда.
           * Теперь подбираем письмо под конкретную вакансию. Если письмо
           * построить не удалось (LLM недоступен и шаблон пуст), отклик всё
           * равно отправляется — письмо улучшает отклик, но не является его
           * условием, и лучше отправить резюме, чем не отправить ничего.
           *
           * Текст для письма берётся из того же резюме, которое уходит на hh.
           * Раньше письмо писалось по последнему обновлённому резюме, а уходило
           * другое — то есть человек мог писать в сопроводительном «5 лет Python»,
           * а отклик уходил с резюме «React». Берём то, что действительно отправляется.
           */
          const letterResumeText = picked?.content || primaryResumeText;
          const letter = await buildLetter(vacancy, letters, letterResumeText);
          const message = letter?.text;

          /*
           * Холостой прогон: подбор, ранжирование и письма идут по-настоящему,
           * а POST в hh заменяется счётчиком. Строка в applications не пишется
           * и счётчик applied не трогается: фиктивные записи врали бы воронке
           * и съедали бы лимит. appliedSet пополняется, чтобы одна и та же
           * вакансия из двух поисков не считалась дважды.
           */
          if (dryRun) {
            dryRuns++;
            if (message) withLetter++;
            else withoutLetter++;
            appliedSet.add(vacancy.slug);
            logApplyEvent(user.id, vacancy.slug, 'dry', 'холостой прогон');
            continue;
          }

          /*
           * Outbox-claim ДО сети: если процесс умрёт между успешным POST и
           * записью в applications, останется заявка pending, а не тишина.
           * Сборщик протухших в начале прогона её подчистит, а повторная
           * отправка упрётся в already_applied и закроется gracefully.
           * Дубликат здесь — параллельный прогон/кнопка уже ведёт эту вакансию:
           * проверяем, не успел ли он записать, и отвечаем честно.
           */
          const claim = claimSend({
            userId: user.id,
            jobSlug: vacancy.slug,
            resumeId: sendableId,
            letterId: letter?.letterId ?? null,
            message: message ?? '',
            searchId: search.id,
          });
          if ('duplicate' in claim) {
            const done = db
              .prepare(
                'SELECT id FROM applications WHERE user_id = ? AND job_slug = ? AND withdrawn = 0',
              )
              .get(user.id, vacancy.slug);
            if (done) {
              skipped++;
              logApplyEvent(user.id, vacancy.slug, 'already', 'гонка: строка уже есть');
            } else {
              skipped++;
              logApplyEvent(user.id, vacancy.slug, 'already', 'параллельная отправка в работе');
            }
            continue;
          }

          let result: Awaited<ReturnType<NonNullable<typeof hhProvider.apply>>>;
          try {
            result = await hhProvider.apply(vacancy, {
              resumeId: sendableId,
              ...(message ? { message } : {}),
              accessToken: token ?? undefined,
            });
          } catch (err) {
            // Сеть упала исключением: заявку снимаем, ошибку — наверх, в
            // изоляцию пользователя. Пауза здесь не ставится: неизвестно, ушёл
            // ли отклик, а backoff по неизвестности бил бы по всем остальным.
            completeSend(claim.id);
            throw err;
          }
          if (!result.ok) {
            failed++;
            /*
             * Backoff включается не на каждый отказ, а только на тот, который
             * говорит о риске для аккаунта.
             *
             * Раньше здесь стояло безусловное recordFailure("platform"), и
             * закрытая вакансия — а каталог держит записи неделю — включала
             * экспоненциальную паузу. То есть мёртвая запись, попавшая в
             * подбор, замедляла все последующие отклики на часы. Теперь
             * «вакансии больше нет» просто пропускается: это не отказ платформы
             * и никакого отношения к риску блокировки не имеет.
             */
            /*
             * Отказ из hh разбирается по виду, а не по факту неудачи.
             *
             * Раньше здесь стояло `kind === "rate_limit" ? "platform" :
             * "network"`, то есть 403 от hh — аккаунт ограничен — считался
             * сетевым сбоем и получал паузу в несколько минут вместо остановки
             * на часы. Это ровно тот случай, когда надо молчать нельзя: если
             * аккаунт ограничили, человек теряет отклики и не понимает почему.
             *
             * Закрытая вакансия — не отказ платформы и никакого отношения к риску
             * блокировки не имеет: каталог хранит записи неделю, и мёртвая
             * запись, попавшая в подбор, замедляла бы все последующие отклики.
             */
            const kind = result.kind ?? 'other';
            // Заявка outbox закрывается при любом исходе, кроме успеха:
            // висящий pending блокировал бы повторную попытку до чистки.
            completeSend(claim.id);
            if (kind === 'closed') {
              skipped++;
              logApplyEvent(user.id, vacancy.slug, 'skipped_closed', result.error ?? '');
              continue;
            }
            if (kind === 'auth') {
              blockedUser = true;
              blockReason = 'hh.ru ограничил доступ к аккаунту';
              logApplyEvent(user.id, vacancy.slug, 'blocked', result.error ?? '');
            } else if (kind === 'token') {
              /*
               * Токен истёк — это не ограничение аккаунта. Шестичасовая
               * остановка здесь вредила бы: токен сам не воскреснет, а
               * перепривязка в кабинете занимает минуту. Пауза короткая
               * (rate_limit через toFailureKind ниже), а человек получает
               * предупреждение один раз на инцидент — см. ниже.
               */
              tokenExpiredUser = true;
              logApplyEvent(user.id, vacancy.slug, 'failed', result.error ?? '');
            } else {
              logApplyEvent(user.id, vacancy.slug, 'failed', result.error ?? kind);
            }
            pacing.recordFailure(toFailureKind(kind));
            /*
             * Срок от площадки важнее рассчитанной паузы.
             *
             * Если hh назвал конкретный срок, ждать меньше — значит прийти раньше
             * и получить 429 ещё раз. Раньше заголовок терялся в HTTP-клиенте, и
             * паузер считал паузу сам, то есть почти наверняка неправильно.
             */
            if (result.retryAfterMs && result.retryAfterMs > 0) {
              pacing.respectRetryAfter(result.retryAfterMs);
            }
            logError('autoapply', new Error(result.error ?? 'apply failed'), {
              userId: user.id,
              slug: vacancy.slug,
              kind,
            });
            continue;
          }

          pacing.recordSent();
          const now = Date.now();
          /* В applications пишется именно то резюме, что ушло, а не общее
             users.hh_resume_id. Иначе история откликов показывала бы чужое
             резюме, и понять, почему на вакансию фронтенда ушло «Python», было
             бы невозможно. */
          try {
            db.prepare(
              `INSERT INTO applications (user_id, job_slug, search_id, resume_id, letter_id, message, status, origin, sent_at)
               VALUES (?, ?, ?, ?, ?, ?, 'sent', 'real', ?)`,
            ).run(
              user.id,
              vacancy.slug,
              search.id,
              sendableId,
              letter?.letterId ?? null,
              message ?? '',
              now,
            );
          } catch (err) {
            // Гонка с параллельным прогоном/кнопкой: строка уже есть (проверка
            // выше прошла до чужого INSERT). Внешняя отправка уже случилась,
            // поэтому это пропуск, а не ошибка: следующий тик увидит
            // already_applied и тоже пропустит. Свою заявку гасим: чужую строку
            // создал чужой claim, и она закроется сама.
            if (!isUniqueViolation(err)) throw err;
            completeSend(claim.id);
            skipped++;
            logApplyEvent(user.id, vacancy.slug, 'already', 'гонка вставки: строка уже есть');
            continue;
          }
          completeSend(claim.id);
          appliedSet.add(vacancy.slug);
          applied++;
          sentThisTick++;
          logApplyEvent(user.id, vacancy.slug, 'sent', message ? 'с письмом' : 'без письма');
          /*
           * Отклик записан в счёт потолка компании сразу.
           *
           * Список за день собирается один раз на прогон, и без этой строки он
           * оставался бы пустым до следующего тика: девять откликов в одну
           * компанию проходили как девять в разные.
           */
          if (company) slugs.push({ job_slug: vacancy.slug, company });
          if (message) withLetter++;
          else withoutLetter++;

          // Успех снимает прошлую блокировку: ограничение могло снять сам hh.
          if (blockedUntilCol > 0) {
            db.prepare(
              `UPDATE users SET autoapply_blocked_until = 0, autoapply_block_reason = '' WHERE id = ?`,
            ).run(user.id);
          }
          // Успешная отправка доказывает живой токен: старое предупреждение
          // об истёкшем сеансе снято, следующий сбой предупредит заново.
          clearHhTokenWarning(user.id);
        }
      }

      if (blockedUser) {
        /*
         * Останавливаемся сами, а не ждём следующего тика.
         *
         * Планировщик сам вызывает decide() каждый тик, но между тиками может
         * пройти минута, за которую успеет уйти ещё несколько откликов в
         * ограниченный аккаунт. Состояние пишется в БД, поэтому перезапуск
         * процесса его не сбросит.
         */
        setBlockedUntil(user.id, Date.now() + BLOCK_STOP_MS, blockReason);
        blockedUsers++;
        logError('autoapply', new Error(blockReason), { userId: user.id });
        /*
         * Сообщение сразу, а не в следующем дайджесте.
         *
         * При 403 отклики не уходят вообще: человек без уведомления видит только
         * «их мало» и никаких зацепок. Даже если уведомление не уйдёт, пауза уже
         * стоит — то есть худший случай здесь тишина, а не удар по аккаунту.
         */
        try {
          await notifyAccountBlocked(
            user.telegram_chat_id,
            blockReason,
            Date.now() + BLOCK_STOP_MS,
          );
        } catch (err) {
          logError('autoapply:notify', err, { userId: user.id });
        }
        // Остальные пользователи продолжают: 403 — проблема этого аккаунта,
        // а не всего сервиса. Раньше флаг stopAll обрывал прогон для всех —
        // один ограниченный аккаунт лишал откликов остальных до следующего тика.
      }

      if (tokenExpiredUser) {
        /*
         * Сеанс истёк, а не ограничен: чинится перепривязкой hh в кабинете.
         * Дедуп — сутки на пользователя внутри notifyHhTokenExpiredForUser,
         * отправка best-effort: тишина здесь хуже повтора, а остановка на
         * часы не нужна — токен сам не воскреснет ни через час, ни через шесть.
         */
        try {
          await notifyHhTokenExpiredForUser(user.id);
        } catch (err) {
          logError('autoapply:notify-token', err, { userId: user.id });
        }
      }

      if (appliedSet.size > 0) {
        logInfo('autoapply', `отправлено откликов: ${appliedSet.size}`, { userId: user.id });
      }
    } catch (err) {
      erroredUsers++;
      logError('autoapply:user', err, { userId: user.id });
    }
  }

  const shared = {
    searches,
    applied,
    failed,
    skipped,
    stale: staleTotal,
    pausedFor,
    pausedDetail,
    pausedUsers,
    blockedUsers,
    withLetter,
    withoutLetter,
    demoUsers,
    erroredUsers,
    dryRuns,
    lockLost,
  };

  if (!ran) {
    /*
     * Причина «ничего не было» называется точно.
     *
     * Раньше здесь стояла одна строка про «нет активных поисков», и она была
     * верной меньше чем в половине случаев: у человека мог быть активный
     * тариф, активные поиски и подходящие вакансии — и всё равно был ноль,
     * потому что он был в демо-режиме. Читать это как «вам нечего откликаться
     * на» — то самое враньё, ради которого отчёт и делается.
     */
    const reason = lockLost
      ? 'прогон остановлен: блокировка перехвачена другим процессом'
      : demoUsers > 0
        ? 'все активные аккаунты в демо-режиме: реальные отклики не отправляются'
        : 'нет активных поисков у пользователей с активным тарифом';
    return { ran: false, reason, ...shared };
  }
  return { ran: true, ...shared };
}

export type ApplyOutcome =
  | { ok: true; resumeId: string; withLetter: boolean }
  | {
      ok: false;
      kind:
        | 'closed'
        | 'rate_limit'
        | 'auth'
        | 'token'
        | 'network'
        | 'other'
        | 'not_found'
        | 'already'
        | 'paused'
        | 'no_resume'
        | 'stale'
        | 'dry'
        | 'demo';
      error: string;
    };

/**
 * Отклик на одну вакансию по прямому указанию человека.
 *
 * Нужен для команды бота `/отклик N`. Раньше бот на такую команду отвечал
 * «Запускаю отклики» и не делал ничего — человек нажимал и ждал откликов,
 * которых не было.
 *
 * Идёт через тот же путь, что и плановый прогон: подбор резюме, письмо,
 * классификация отказа, паузер, запись в applications. Отдельный путь означал бы
 * второе место, где эти правила могут разойтись с плановым — а они уже разошлись
 * один раз, когда сортировка брала одно резюме, а отправлялось другое.
 */
/**
 * Один отклик по прямому указанию: из бота или из кабинета.
 *
 * `opts.now` подменяет часы. Рабочее окно 9:00–20:00 — часть защиты
 * аккаунта, и ночью отклик не уходит; без подмены часов проверки этого пути
 * зависели от времени запуска и падали вечером при исправном коде.
 */
export async function applyToVacancy(
  user: User,
  vacancy: Vacancy,
  opts: { now?: () => number } = {},
): Promise<ApplyOutcome> {
  /*
   * Демо-режим отсекает отклик по указанию человека, и это первое, что надо
   * проверить: дальше идут тариф, пауза и квоты, но человеку они не помогут,
   * если он сам выбрал не отправлять.
   */
  if (!isLiveMode(user)) return { ok: false, kind: 'demo', error: DEMO_MODE_MESSAGE };
  if (!isPlanActive(user))
    return { ok: false, kind: 'auth', error: 'Тариф истёк — автоотклики на паузе' };
  if (user.autoapply_paused) return { ok: false, kind: 'paused', error: 'Автоотклики на паузе' };
  // Холостой режим режет все внешние эффекты, включая прямые указания:
  // staging с живыми данными не должен отправлять ничего.
  if (autoapplyDryRun()) {
    return {
      ok: false,
      kind: 'dry',
      error: 'Холостой режим (AUTOAPPLY_DRY_RUN=1): подбор работает, отправка отключена',
    };
  }
  // Ограничение площадки действует и на ручной отклик: долбить 403-аккаунт
  // из бота — тот же удар, что из планировщика.
  if (blockedUntil(user.id) > 0) {
    return {
      ok: false,
      kind: 'auth',
      error: 'hh.ru временно ограничил доступ — отклики на паузе до снятия',
    };
  }

  const limit = planDailyLimit(user.plan);
  if (todayCount(user.id) >= limit) {
    return { ok: false, kind: 'rate_limit', error: `Дневной лимит тарифа исчерпан (${limit})` };
  }

  if (!onlyFresh([vacancy]).length) {
    return {
      ok: false,
      kind: 'stale',
      error: 'Вакансия старше двух дней — скорее всего, она уже закрыта',
    };
  }

  const already = db
    .prepare('SELECT id FROM applications WHERE user_id = ? AND job_slug = ? AND withdrawn = 0')
    .get(user.id, vacancy.slug);
  if (already) return { ok: false, kind: 'already', error: 'Вы уже откликались на эту вакансию' };

  const resumes = getUserResumes(user.id);
  const fallbackResumeId = user.hh_resume_id?.trim() || null;
  const picked = bestResumeFor(vacancy, resumes);
  const sendableId = picked?.hh_id ?? fallbackResumeId;
  if (!sendableId) {
    return {
      ok: false,
      kind: 'no_resume',
      error: 'Нет резюме для отправки — импортируйте его с hh в кабинете',
    };
  }

  const valid = await getValidHhToken(user);
  const token = valid?.token ?? null;
  if (!token) return { ok: false, kind: 'auth', error: 'Аккаунт hh.ru не привязан' };
  if (!hhProvider.apply) return { ok: false, kind: 'other', error: 'Отправка недоступна' };

  const base = effectivePacing(limit);
  const remaining = Math.max(0, limit - todayCount(user.id));
  const effBase = {
    hourlyLimit: base.hourlyCap,
    minDelayMs: base.minDelayMs,
    maxDelayMs: base.maxDelayMs,
    workStartHour: base.workStartHour,
    workEndHour: base.workEndHour,
  };
  const pacing = pacingFor(
    user.id,
    { ...effBase, dailyLimit: Math.min(remaining, base.dailyCap) },
    opts.now ?? (() => Date.now()),
  );
  const decision = pacing.decide();
  if (!decision.allowed) {
    return {
      ok: false,
      kind: decision.reason === 'backoff' ? 'rate_limit' : 'paused',
      error:
        decision.reason === 'backoff'
          ? 'Пауза после отказа платформы — она снимется сама'
          : 'Сейчас не время отправки: лимит или ночной режим',
    };
  }

  const letter = await buildLetter(vacancy, getLetters(user.id), picked?.content ?? '');
  const message = letter?.text;
  const claim = claimSend({
    userId: user.id,
    jobSlug: vacancy.slug,
    resumeId: sendableId,
    letterId: letter?.letterId ?? null,
    message: message ?? '',
  });
  if ('duplicate' in claim) {
    return { ok: false, kind: 'already', error: 'Отправка уже идёт — проверьте отклики через минуту' };
  }
  let result: Awaited<ReturnType<NonNullable<typeof hhProvider.apply>>>;
  try {
    result = await hhProvider.apply(vacancy, {
      resumeId: sendableId,
      ...(message ? { message } : {}),
      accessToken: token,
    });
  } catch (err) {
    completeSend(claim.id);
    throw err;
  }

  if (!result.ok) {
    const kind = result.kind ?? 'other';
    completeSend(claim.id);
    if (kind === 'closed') {
      // Вакансию сняли — это не отказ платформы, откат здесь только вредит.
      logApplyEvent(user.id, vacancy.slug, 'skipped_closed', result.error ?? '');
    } else if (kind === 'auth') {
      // Отклик из чата тоже может упереться в ограничение аккаунта.
      setBlockedUntil(user.id, Date.now() + BLOCK_STOP_MS, 'hh.ru ограничил доступ к аккаунту');
      pacing.recordFailure('blocked');
      logApplyEvent(user.id, vacancy.slug, 'blocked', result.error ?? '');
    } else {
      pacing.recordFailure(toFailureKind(kind));
      logApplyEvent(user.id, vacancy.slug, 'failed', result.error ?? kind);
    }
    return { ok: false, kind, error: result.error ?? 'Платформа отклонила отклик' };
  }

  pacing.recordSent();
  try {
    db.prepare(
      `INSERT INTO applications (user_id, job_slug, resume_id, letter_id, message, status, origin, sent_at)
       VALUES (?, ?, ?, ?, ?, 'sent', 'real', ?)`,
    ).run(user.id, vacancy.slug, sendableId, letter?.letterId ?? null, message ?? '', Date.now());
  } catch (err) {
    // Гонка с плановым прогоном: строка уже есть, внешняя отправка уже
    // случилась. Честный ответ — «уже откликались», а не 500.
    if (!isUniqueViolation(err)) throw err;
    completeSend(claim.id);
    logApplyEvent(user.id, vacancy.slug, 'already', 'гонка вставки: строка уже есть');
    return { ok: false, kind: 'already', error: 'Вы уже откликались на эту вакансию' };
  }
  completeSend(claim.id);
  logApplyEvent(user.id, vacancy.slug, 'sent', message ? 'с письмом (бот/кабинет)' : 'без письма');

  return { ok: true, resumeId: sendableId, withLetter: Boolean(message) };
}
