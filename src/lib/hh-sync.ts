import { db, type User } from './db';
import { getValidHhToken } from './hh-oauth';
import {
  responseForHhState,
  isClosedState,
  isReviewedNegotiation,
  hhStateLabel,
} from './hh-states';
import { httpFetch, parseJson } from './http-client';
import { logError, logInfo } from './logger';

/**
 * Синхронизация статусов откликов с hh.ru.
 *
 * Реальный запрос к GET /negotiations с токеном пользователя.
 * Обновляет viewed_at/responded_at/response в БД по данным hh.
 *
 * ## Что здесь было сломано
 *
 * Три независимые поломки, каждая из которых по отдельности обнуляла
 * статистику. Вместе они означали, что синхронизация не работала никогда,
 * хотя формально вызывалась каждый тик планировщика.
 *
 * 1. Эндпоинт `/negotiations/active` отдаёт только АКТИВНЫЕ переписки.
 *    Отказ (`discard`) в них не попадает — он отдельным статусом. Значит
 *    ветка записи `status='declined'` была недостижима в принципе, и
 *    «Отказы» были нулём всегда, хотя и считались в getStats.
 *
 * 2. `per_page` не передавался. Дефолт hh — 20 записей на страницу, при
 *    лимите тарифа 250 откликов в сутки синхронизировались 20 самых свежих,
 *    а остальные навсегда. Страницы не обходились вовсе.
 *
 * 3. Переписки сопоставлялись с откликами через `JOIN vacancies` по
 *    `v.source_id`. Но каталог чистится по TTL в 7 дней (vacancies/index.ts),
 *    а `applications` не удаляется никогда. То есть для всех откликов старше
 *    недели строки в `vacancies` уже нет, JOIN их отбрасывал, и статус не
 *    приходил никогда. JOIN был и не нужен: идентификатор вакансии hh сидит
 *    прямо в slug отклика (`hh-<id>`), то есть в данных, которые не
 *    выбрасываются.
 */

/** Актуальный ресурс переписок. `status=all` — иначе отказов не видно. */
const NEGOTIATIONS_URL = 'https://api.hh.ru/negotiations';

const PAGE_LIMIT = 100;
/** hh отдаёт по 100 за раз; 20 страниц — 2000 переписок, больше не бывает. */
const MAX_PAGES = 20;
const REQUEST_TIMEOUT_MS = 20_000;

type HhNegotiation = {
  state?: { id?: string; name?: string };
  created_at?: string;
  updated_at?: string;
  /** Признак «работодатель рассмотрел отклик». Единственный честный сигнал. */
  reviewed?: boolean;
  unread_messages?: number;
  /** id вакансии; в части ответов приходит только в ссылке — см. vacancyIdOf. */
  vacancy?: { id?: string };
  url?: string;
};

type HhNegotiationsResponse = {
  items?: HhNegotiation[];
  found?: number;
  hidden_count?: number;
};

/**
 * Идентификатор вакансии hh в переписке.
 *
 * Берётся из поля `vacancy.id`, а если его нет — из ссылки
 * `…vacancyId=30251545`. Вторая ветка нужна потому, что состав полей
 * переписки менялся на площадке, и полагаться только на `vacancy.id` —
 * значит однажды молча потерять сопоставление целиком.
 */
function vacancyIdOf(n: HhNegotiation): string | null {
  const direct = n.vacancy?.id;
  if (direct) return direct;
  const fromUrl = /vacancyId=(\d+)/.exec(n.url ?? '')?.[1];
  return fromUrl ?? null;
}

/**
 * Сравнение идентификаторов вакансий как чисел.
 *
 * hh отдаёт id иногда с ведущими нулями — строковое сравнение роняло такие
 * сопоставления молча. Сравнение только для цифровых строк: мусор вместо id
 * совпадением не считаем.
 */
export function sameVacancyId(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return a === b;
  return a.replace(/^0+/, '') === b.replace(/^0+/, '');
}

/** Момент времени hh; на битой дате — null, чтобы не записать NaN в INTEGER. */
function timeOf(iso: string | undefined, fallback: number): number {
  if (!iso) return fallback;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : fallback;
}

/**
 * Забрать все переписки пользователя.
 *
 * Страницы обходятся до конца: `found` говорит, сколько записей у площадки
 * всего, и цикл идёт, пока не набрано. Раньше страниц не было вовсе, и при
 * 40 активных переписках 20 из них были не видны — причём молча.
 */
async function fetchNegotiations(token: string): Promise<HhNegotiation[]> {
  const out: HhNegotiation[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      // all, а не active: иначе отказы и закрытые переписки не приходят
      // вовсе, а это ровно те события, ради которых синхронизация нужна.
      status: 'all',
      per_page: String(PAGE_LIMIT),
      page: String(page),
      order_by: 'updated_at',
    });
    const res = await httpFetch(`${NEGOTIATIONS_URL}?${params.toString()}`, {
      timeoutMs: REQUEST_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'EZOffer/1.0',
      },
    });

    if (!res.ok) {
      // Первая страница не пришла — синхронизации нет. Статус цепляем к
      // ошибке: 401/403 означают мёртвый токен или отозванный доступ — о них
      // надо предупредить человека, а не просто записать в лог. Текст.match
      // ниже в catch дублирует проверку на случай, если ошибку обернули.
      if (page === 0) {
        const err = new Error(`hh.ru вернул HTTP ${res.status}`) as Error & { hhStatus?: number };
        err.hhStatus = res.status;
        throw err;
      }
      /*
       * Обрыв на второй и дальше страницах — частичная выборка, а не успех.
       * Молчаливый break выдавал обрезанный набор за полный: инвайты и отказы
       * с deep-страниц терялись без следа и без ошибки в логе.
       */
      const err = new Error(
        `hh.ru оборвал выдачу на странице ${page}: HTTP ${res.status}`,
      ) as Error & { hhStatus?: number; partial?: HhNegotiation[] };
      err.hhStatus = res.status;
      err.partial = out;
      throw err;
    }

    const data = parseJson<HhNegotiationsResponse>(res.body);
    const items = data?.items ?? [];
    if (items.length === 0) break;
    out.push(...items);

    const found = typeof data?.found === 'number' ? data.found : null;
    if (found !== null && out.length >= found) break;
    if (items.length < PAGE_LIMIT) break;
  }
  return out;
}

/**
 * Минимальный интервал между опросами переписок одного пользователя, мс.
 *
 * Живой человек открывает страницу откликов несколько раз в день, а не
 * 288 раз в сутки. Полный дамп `GET /negotiations?status=all` постранично
 * на каждом тике планировщика — громкий и бессмысленный сигнал: статусы
 * не меняются каждую минуту, а дайджест всё равно ходит раз в 6 часов.
 */
export function hhSyncMinIntervalMs(): number {
  const raw = process.env.HH_SYNC_MIN_INTERVAL_MS;
  if (raw === undefined || raw.trim() === '') return 15 * 60 * 1000;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 15 * 60 * 1000;
  return Math.max(60_000, Math.floor(n));
}

function lastSyncKey(userId: number): string {
  return `hh:last-sync:${userId}`;
}

export async function syncHhStatuses(
  userId: number,
  opts?: { force?: boolean; minIntervalMs?: number },
): Promise<{ updated: number; error?: string; authFailed?: boolean; throttled?: boolean }> {
  const now = Date.now();
  /*
   * Троттлинг опроса переписок: чаще раза в интервал не ходим.
   *
   * Отметка ставится ДО сети по попытке, а не по успеху: лежащий hh.ru
   * иначе давал бы горячий цикл 401/502 на каждом тике, а частые 401 —
   * отдельный плохой сигнал (похоже на перебор). Ручной вызов с force
   * (кнопка «обновить» в кабинете) троттлинг обходит.
   */
  if (!opts?.force) {
    const minInterval = opts?.minIntervalMs ?? hhSyncMinIntervalMs();
    const lastRow = db.prepare('SELECT value FROM meta WHERE key = ?').get(lastSyncKey(userId)) as
      | { value: string }
      | undefined;
    if (lastRow && now - Number(lastRow.value) < minInterval) {
      return { updated: 0, throttled: true };
    }
    db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(lastSyncKey(userId), String(now));
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
  if (!user) return { updated: 0 };
  /*
   * Токен — внутри try: getValidHhToken бросает при битом ключе шифрования,
   * и раньше исключение вылетало мимо локального catch — пользователь тихо
   * пропускался без authFailed и без предупреждения.
   */
  try {
    const token = (await getValidHhToken(user))?.token;
    if (!token || !user.hh_resume_id) {
      return { updated: 0 };
    }

    /*
     * Частичная выдача (обрыв на странице 1+) обрабатывается, а не
     * выбрасывается: первые страницы — настоящие статусы, и терять их ради
     * ошибки на глубокой странице нельзя. Но и молчать нельзя: итог
     * помечается ошибкой, чтобы планировщик залогировал, а следующий тик
     * добрал остаток.
     */
    let items: HhNegotiation[];
    let partialError: string | null = null;
    try {
      items = await fetchNegotiations(token);
    } catch (e) {
      const partial = (e as { partial?: HhNegotiation[] } | null)?.partial;
      if (!partial) throw e;
      items = partial;
      partialError = e instanceof Error ? e.message : 'network error';
    }

    // По вакансии, а не по флагу разобранного состояния: две переписки по
    // одной вакансии (повторный отклик) должны схлопнуться в одну запись.
    const hhVacancies = new Map<string, HhNegotiation>();
    for (const n of items) {
      const vacancyId = vacancyIdOf(n);
      if (!vacancyId) continue;
      const previous = hhVacancies.get(vacancyId);
      // Список отсортирован по updated_at, поэтому первая — свежайшая.
      if (!previous) hhVacancies.set(vacancyId, n);
    }

    /*
     * Счётчик — по откликам, а не по записям: viewed_at и decline одного
     * отклика — это два UPDATE, но один «обновлённый статус». Иначе один
     * отказ учитывался бы дважды и врал в лог «обновлено статусов».
     */
    const touched = new Set<number>();
    /*
     * Отклики hh берутся напрямую по slug, без JOIN с vacancies.
     *
     * slug — это `hh-<id>` (vacancies/hh.ts), то есть идентификатор площадки
     * лежит в нём самом. Соединение с каталогом было нужно только ради
     * source_id, а каталог протухает за 7 дней: JOIN выбрасывал ровно те
     * отклики, ради которых синхронизация и нужна.
     */
    const apps = db
      .prepare(
        `SELECT id, job_slug, status, viewed_at, responded_at, response, response_note, withdrawn
         FROM applications
         WHERE user_id = ? AND job_slug LIKE 'hh-%' AND withdrawn = 0`,
      )
      .all(userId) as {
      id: number;
      job_slug: string;
      status: string;
      viewed_at: number | null;
      responded_at: number | null;
      response: string;
      response_note: string;
      withdrawn: number;
    }[];

    for (const app of apps) {
      const vacancyId = app.job_slug.slice(3);
      const hh = hhVacancies.get(vacancyId);
      if (!hh) continue;
      // Идентификатор из slug и из переписки обязаны совпадать как числа:
      // "30251545" и "030251545" — один id, но строки разные.
      if (!sameVacancyId(vacancyId, vacancyIdOf(hh))) continue;
      const now = Date.now();
      const updatedAt = timeOf(hh.updated_at, now);

      const state = hh.state?.id ?? null;
      const response = responseForHhState(state);
      const closed = isClosedState(state);
      const reviewed = isReviewedNegotiation(hh.reviewed);

      /*
       * Причина отказа берётся из `state.name` — это текст самой площадки
       * («Вакансия закрыта», «Отказ по причине отсутствия опыта»), и для
       * человека это единственное объяснение, которое что-то значит.
       * Ключ состояния в подпись не годится: по нему получилось бы
       * «discard» — слово, которого на русском нет.
       */
      const label = hh.state?.name?.trim() || hhStateLabel(state);

      // Рассмотрено: единственный признак, который hh отдаёт соискателю.
      if (reviewed && app.viewed_at === null) {
        const r = db
          .prepare('UPDATE applications SET viewed_at = ? WHERE id = ? AND viewed_at IS NULL')
          .run(updatedAt, app.id);
        if (r.changes > 0) touched.add(app.id);
      }

      /*
       * Отказ — это и ответ, и закрытие. Ответом он делается через
       * responded_at: иначе отказы выпадали бы из знаменателя «ответили HR»
       * и портили расчёт конверсии.
       *
       * Ключевое: перезаписывать уже записанный ответ нельзя. Отклик, который
       * сначала пригласили, а потом отказали, должен остаться приглашением с
       * пометкой об отказе — иначе приглашение исчезает из статистики навсегда.
       * Раньше здесь стоял безусловный UPDATE в status='declined',
       * response='decline': инвайт затирался, хотя комментарий требовал ровно
       * обратного. Теперь приглашение не трогаем — только метки и причину.
       *
       * Второе: пишем только если есть что менять. Без проверки каждый тик
       * переписывал все закрытые и приглашённые строки теми же значениями:
       * WAL-шум на каждую минуту и врёт счётчик «обновлено статусов».
       */
      if (closed) {
        /*
         * Приглашение сильнее последующего отказа, но отказ — тоже факт:
         * пометка дописывается к существующей («Приглашение; Отказ: …»).
         * Проверка по вхождению метки, а не по пустоте: иначе каждый тик
         * дописывал бы причину заново и заметка росла бы бесконечно.
         */
        if (app.response === 'interview') {
          const declineLabel = label ?? 'отказ';
          const note = app.response_note ?? '';
          const newNote = note
            ? note.includes(declineLabel)
              ? note
              : `${note}; ${declineLabel}`
            : declineLabel;
          const needViewed = reviewed && app.viewed_at == null;
          const needResponded = app.responded_at == null;
          if (!needViewed && !needResponded && newNote === note) continue;
          db.prepare(
            `UPDATE applications
              SET viewed_at = COALESCE(viewed_at, ?),
                  responded_at = COALESCE(responded_at, ?),
                  response_note = ?
             WHERE id = ?`,
          ).run(reviewed ? updatedAt : null, updatedAt, newNote, app.id);
          touched.add(app.id);
          continue;
        }
        const needViewed = reviewed && app.viewed_at == null;
        const needResponded = app.responded_at == null;
        const needNote = !app.response_note;
        const needState = app.status !== 'declined' || app.response !== 'decline';
        if (!needViewed && !needResponded && !needNote && !needState) continue;
        db.prepare(
          `UPDATE applications
            SET viewed_at = COALESCE(viewed_at, ?),
                responded_at = COALESCE(responded_at, ?),
                status = 'declined',
                response = 'decline',
                response_note = COALESCE(NULLIF(response_note, ''), ?)
           WHERE id = ?`,
        ).run(reviewed ? updatedAt : null, updatedAt, label ?? 'отказ', app.id);
        touched.add(app.id);
        continue;
      }

      if (response === 'interview') {
        const needViewed = reviewed && app.viewed_at == null;
        const needResponded = app.responded_at == null;
        const needNote = !app.response_note;
        const needState = app.status !== 'responded' || app.response !== 'interview';
        if (!needViewed && !needResponded && !needNote && !needState) continue;
        db.prepare(
          `UPDATE applications
            SET viewed_at = COALESCE(viewed_at, ?),
                responded_at = COALESCE(responded_at, ?),
                status = 'responded',
                response = 'interview',
                response_note = COALESCE(NULLIF(response_note, ''), ?)
           WHERE id = ?`,
        ).run(reviewed ? updatedAt : null, updatedAt, label ?? 'приглашение', app.id);
        touched.add(app.id);
      }
    }

    if (touched.size > 0) {
      logInfo('hh:sync', `обновлено статусов: ${touched.size}`, { userId });
    }
    return partialError
      ? { updated: touched.size, error: partialError }
      : { updated: touched.size };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'network error';
    /*
     * 401/403 — токен мёртв, отозван или урезан скоп: это не «сеть», а
     * состояние аккаунта. Флаг забирает планировщик и будит человека
     * предупреждением вместо тишины в статистике.
     */
    const status = (e as { hhStatus?: number } | null)?.hhStatus;
    const authFailed =
      status === 401 || status === 403 || /HTTP 40[13]\b/.test(msg);
    return authFailed ? { updated: 0, error: msg, authFailed: true } : { updated: 0, error: msg };
  }
}

export async function syncAllHhUsers(heartbeat?: () => boolean): Promise<number[]> {
  const users = db
    .prepare("SELECT id FROM users WHERE hh_token IS NOT NULL AND hh_token != ''")
    .all() as {
    id: number;
  }[];
  const authFailed: number[] = [];
  let throttled = 0;
  for (const u of users) {
    if (heartbeat && !heartbeat()) return authFailed;
    try {
      const res = await syncHhStatuses(u.id);
      if (res.throttled) {
        throttled++;
        continue;
      }
      if (res.error) {
        logError('scheduler:sync:all', new Error(res.error), { userId: u.id });
      }
      if (res.authFailed) authFailed.push(u.id);
    } catch (err) {
      logError('scheduler:sync:all', err, { userId: u.id });
    }
  }
  if (throttled > 0) {
    logInfo('hh:sync', `пропущено по троттлингу опроса: ${throttled}`);
  }
  return authFailed;
}
