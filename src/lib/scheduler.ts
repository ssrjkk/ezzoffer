import type BetterSqlite3 from 'better-sqlite3';
import { db } from './db';
import { refreshCatalogForSearches, slowProvidersDue, fastProvidersDue } from './catalog-refresh';
import { runAutoApply } from './autoapply';
import { saveLastRun } from './autoapply-store';
import { sendAlerts, sendDigests, sendExpiryWarnings } from './telegram-digest';
import { processInbox } from './telegram-bot';
import { getVacancyBySlug } from './vacancies';
import { syncAllHhUsers } from './hh-sync';
import { logError, logInfo } from './logger';

/**
 * Центральный планировщик реальных фоновых задач (однопоточный, с блокировкой от перекрытия):
 *  1. Обновление каталога вакансий (если устарел);
 *  2. Автоотклики через анти-бан паузер;
 *  3. Синхронизация статусов с hh.ru.
 */

const LOCK_KEY = 'scheduler:lock';
const CATALOG_REFRESH_KEY = 'scheduler:catalog_refresh';
const CATALOG_FAST_REFRESH_KEY = 'scheduler:catalog_fast_refresh';
const LOCK_TTL_MS = 30 * 60 * 1000;

/**
 * Блокировки по фазам, а не одна на весь тик.
 *
 * Старый дизайн держал `scheduler:lock` на весь цикл: каталог, отправки,
 * синхронизация, дайджесты. Когда отправки стали занимать до 10 минут тика,
 * обновление каталога и синхронизация голодали следом — свежие вакансии и
 * статусы ждали, пока досыплются отклики. Теперь у каждой фазы свой лок:
 * занята отправка — каталог всё равно обновится, и наоборот.
 *
 * Ручной /api/autoapply/run берёт только apply-лок: с планировщиком он
 * делится отправками, а не всем тиком.
 */
export const CATALOG_LOCK_KEY = 'scheduler:lock:catalog';
export const APPLY_LOCK_KEY = 'scheduler:lock:apply';
export const SYNC_LOCK_KEY = 'scheduler:lock:sync';

type MetaStore = Pick<BetterSqlite3.Database, 'prepare'>;

function getMeta(instance: MetaStore, key: string): string | null {
  const row = instance.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value ?? null;
}

function setMeta(instance: MetaStore, key: string, value: string): void {
  instance
    .prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}

/**
 * Блокировка от перекрытия прогонов планировщика.
 *
 * Метка хранится в таблице meta и должна сниматься вызывающим кодом. Если
 * предыдущий запуск упал и не снял её, новый ждёт TTL — иначе после рестарта
 * два процесса работали бы одновременно.
 *
 * Регрессия: проверка была `if (now - lockAt < TTL) return` сразу после
 * записи метки, из-за чего текущий же прогон выходил, думая, что метка
 * принадлежит другому. Здесь явная проверка `held > 0` отличает «метки нет»
 * от «метка только что поставлена».
 */
export function acquireNamedLock(
  instance: MetaStore,
  key: string,
  now: number,
  ttlMs = LOCK_TTL_MS,
): boolean {
  /*
   * Один statement вместо «прочитать → решить → записать».
   *
   * Старая версия делала SELECT, потом INSERT/UPDATE двумя запросами: два
   * процесса одновременно видели «свободно» и оба записывали метку. Окно
   * маленькое, но планировщик и ручной /api/autoapply/run стартуют именно
   * одновременно, когда человек жмёт «запустить» во время тика.
   *
   * UPSERT с WHERE: вставка проходит всегда, обновление чужой метки — только
   * если она протухла. changes = 0 означает «метка чужая и живая».
   */
  const res = instance
    .prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value
       WHERE CAST(meta.value AS INTEGER) <= ?`,
    )
    .run(key, String(now), now - ttlMs);
  return res.changes > 0;
}

export function acquireLock(instance: MetaStore, now: number, ttlMs = LOCK_TTL_MS): boolean {
  return acquireNamedLock(instance, LOCK_KEY, now, ttlMs);
}

/**
 * Снимает блокировку, чтобы следующий тик мог запуститься.
 *
 * `token` — метка того, кто захватил блокировку (значение, переданное в
 * acquireLock). Если он передан, метка снимается только когда она всё ещё
 * принадлежит этому владельцу.
 *
 * Зачем: без проверки владельца снятие метки из чужого прогона стирало чужую
 * блокировку. Это не абстрактная тонкость. TTL — 30 минут, а прогон планировщика
 * включает обновление каталога по всем площадкам, автоотклики и синхронизацию с
 * hh; на медленной сети он уходит за TTL. Дальше метка считается свободной,
 * её перехватывает ручной запуск через /api/autoapply/run, а по завершении
 * ручного запуска releaseLock удаляет метку уже планировщика — и третий
 * запуск стартует поверх второго, не дожидаясь ни одного.
 *
 * Без `token` поведение прежнее (снять безусловно) — так пользуются тесты и
 * любой код, где блокировку точно никто не перехватил.
 */
export function releaseNamedLock(instance: MetaStore, key: string, token?: number): void {
  if (token === undefined) {
    instance.prepare('DELETE FROM meta WHERE key = ?').run(key);
    return;
  }
  instance.prepare('DELETE FROM meta WHERE key = ? AND value = ?').run(key, String(token));
}

export function releaseLock(instance: MetaStore, token?: number): void {
  releaseNamedLock(instance, LOCK_KEY, token);
}

/** Метка времени текущего владельца блокировки; 0 — блокировка свободна. */
export function lockHeldAtKey(instance: MetaStore, key: string): number {
  return Number(getMeta(instance, key) ?? 0);
}

export function lockHeldAt(instance: MetaStore): number {
  return lockHeldAtKey(instance, LOCK_KEY);
}

/**
 * Продление своей блокировки на длинном прогоне.
 *
 * TTL — 30 минут, а полный цикл (каталог по 13 провайдерам, автоотклики,
 * синхронизация) на медленной сети уходит за него. Без продления метка
 * считалась свободной, её перехватывал второй запуск — и два прогона
 * отправляли отклики поверх друг друга. Продление пишет только свою метку:
 * чужую (перехваченную) не трогаем — возвращаем false, и вызывающий код
 * должен свернуться, а не продолжать поверх чужого прогона.
 */
export function renewNamedLock(
  instance: MetaStore,
  key: string,
  token: number,
  now: number,
): boolean {
  const res = instance
    .prepare('UPDATE meta SET value = ? WHERE key = ? AND value = ?')
    .run(String(now), key, String(token));
  return res.changes > 0;
}

export function renewLock(instance: MetaStore, token: number, now: number): boolean {
  return renewNamedLock(instance, LOCK_KEY, token, now);
}

async function refreshCatalogIfStale(now: number): Promise<void> {
  const last = Number(getMeta(db, CATALOG_REFRESH_KEY) ?? 0);
  /*
   * Каталог обновляется под активные поиски пользователей, а не «общей
   * витриной»: запросы берутся из searches. Раньше здесь стоял вызов
   * refreshProviders({ limit: 50 }) без текста запроса — то есть в базу
   * попадали первые 50 вакансий площадки вообще, независимо от того, что
   * кто-то ищет.
   */
  if (!slowProvidersDue(now, last)) return;
  try {
    const report = await refreshCatalogForSearches({ now: () => now });
    setMeta(db, CATALOG_REFRESH_KEY, String(now));
    if (!report.ran) {
      logInfo('scheduler', `каталог не обновлялся: ${report.skipped}`);
    }
  } catch (err) {
    logError('scheduler:refresh', err);
  }
}

/**
 * Быстрый круг: обновление только быстрых источников.
 *
 * Нужен, чтобы обещание «отклик в первые минуты после публикации» было
 * выполнимо. При шестичасовом интервале вакансия, опубликованная два часа
 * назад, попадала в автоотклик через шесть — то есть обещание нарушалось бы
 * по построению, независимо от настроек пользователя.
 */
async function refreshFastCatalog(now: number): Promise<void> {
  const last = Number(getMeta(db, CATALOG_FAST_REFRESH_KEY) ?? 0);
  if (!fastProvidersDue(now, last)) return;
  try {
    await refreshCatalogForSearches({ now: () => now });
    setMeta(db, CATALOG_FAST_REFRESH_KEY, String(now));
  } catch (err) {
    logError('scheduler:refresh-fast', err);
  }
}

/**
 * Сессия владения блокировкой: захват, продление, снятие.
 *
 * Токен живёт внутри: каждое продление ставит новое время, и снимается
 * последнее, а не стартовое — иначе release не совпадёт и метка зависнет
 * до TTL. Ручной трекинг токена в каждом вызывающем коде уже давал этот
 * баг один раз (снятие по стартовому токену после heartbeat).
 */
export type LockSession = {
  key: string;
  startedAt: number;
  /** Продлить свою метку. false — метку перехватили, надо сворачиваться. */
  heartbeat: () => boolean;
  /** Снять свою метку. Чужую не трогает. */
  release: () => void;
};

/** Занять именованную блокировку или вернуть null, если она чужая и живая. */
export function tryLockSession(
  instance: MetaStore,
  key: string,
  now: number = Date.now(),
): LockSession | null {
  let token = now;
  if (!acquireNamedLock(instance, key, token)) return null;
  return {
    key,
    startedAt: now,
    heartbeat() {
      const t = Date.now();
      if (!renewNamedLock(instance, key, token, t)) return false;
      token = t;
      return true;
    },
    release() {
      releaseNamedLock(instance, key, token);
    },
  };
}

export async function runScheduledJobs(): Promise<void> {
  const now = Date.now();

  /*
   * Фазы идут под своими локами и пропускаются независимо.
   *
   * Раньше весь тик держал один `scheduler:lock`: длинная фаза отправок
   * (теперь до ~10 минут) морила голодом каталог и синхронизацию, а ручной
   * запуск стопарил планировщик целиком. Теперь занятая отправка не мешает
   * обновить каталог, и наоборот — каждая фаза ждёт только себя.
   */
  const catalog = tryLockSession(db, CATALOG_LOCK_KEY, now);
  if (catalog) {
    try {
      await refreshFastCatalog(now);
      await refreshCatalogIfStale(now);
    } catch (err) {
      logError('scheduler:catalog', err);
    } finally {
      catalog.release();
    }
  }

  const apply = tryLockSession(db, APPLY_LOCK_KEY, now);
  if (apply) {
    try {
      /*
       * Итог прогона сохраняем, а не только логируем.
       *
       * Иначе человек открывает панель автооткликов и не видит ничего: откликов
       * «молча ноль», и это неотличимо от поломки. Разбор прогона (почему столько,
       * что мешает) берётся из этой записи.
       *
       * Heartbeat уходит внутрь прогона: при потере лока runAutoApply
       * останавливается с частичным итогом, а не продолжает поверх чужого.
       */
      saveLastRun(await runAutoApply({ heartbeat: () => apply.heartbeat() }), now);
    } catch (err) {
      logError('scheduler:apply', err);
    } finally {
      apply.release();
    }
  }

  const sync = tryLockSession(db, SYNC_LOCK_KEY, now);
  if (sync) {
    try {
      /*
       * Синхронизация hh и разбор inbox — независимо друг от друга.
       * Раньше падение syncAllHhUsers (лежит hh.ru — обычное дело) пропускало
       * и processInbox: бот молчал не потому что сломан, а потому что чужой
       * API чихнул. Входящие команды живут в tg_inbox, им hh не нужен.
       */
      try {
        await syncAllHhUsers(() => sync.heartbeat());
      } catch (err) {
        logError('scheduler:sync-hh', err);
      }
      // Входящие команды бота разбираются здесь же, а не в вебхуке:
      // сетевая работа в HTTP-запросе приводила к ретраям Telegram.
      await processInbox();
      /*
       * Уведомления в Telegram.
       *
       * Идут после синхронизации: приглашения и ответы приходят оттуда, и
       * рассылка до неё видела бы пустую таблицу и молчала. Сначала — по одному
       * ответу на конкретную вакансию, потом — общий дайджест об откликах.
       *
       * Ошибки не поднимаются: упавший Telegram не должен ломать планировщик и
       * останавливать автоотклики.
       */
      try {
        await sendAlerts((slug) => getVacancyBySlug(slug)?.title ?? null);
        await sendDigests();
        await sendExpiryWarnings();
      } catch (err) {
        logError('scheduler:telegram', err);
      }
    } catch (err) {
      logError('scheduler:sync', err);
    } finally {
      sync.release();
    }
  }
}
