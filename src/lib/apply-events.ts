import { db } from './db';

/**
 * Журнал внешних эффектов (только добавление, ничего не переписывается).
 *
 * applications — это состояние («что сейчас»), а apply_events — история
 * («что произошло»): отправка, отказ площадки, блокировка, дубль. Строки
 * applications удаляются/правятся (withdrawn), а журнал — никогда: по нему
 * разбирают, куда уходили отклики, когда воронка врёт.
 */

export type ApplyEventKind = 'sent' | 'failed' | 'dry' | 'blocked' | 'already' | 'expired' | 'skipped_closed';

/** Сколько храним историю внешних эффектов: старше — в бэкап, не в живую базу. */
const APPLY_EVENTS_TTL_MS = 90 * 86_400_000;
const APPLY_EVENTS_PURGE_KEY = 'apply_events:last_purge';

export function logApplyEvent(
  userId: number,
  jobSlug: string,
  kind: ApplyEventKind,
  detail = '',
  now = Date.now(),
): void {
  db.prepare(
    'INSERT INTO apply_events (user_id, job_slug, kind, detail, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(userId, jobSlug, kind, detail.slice(0, 500), now);
  /*
   * Чистка старого — раз в сутки, а не на каждой вставке: иначе каждый отклик
   * тянул бы за собой DELETE по всей таблице. Без чистки журнал рос бы
   * бесконечно (остальные журналы — digest-метки, tg_inbox — чистятся).
   */
  const last = db.prepare('SELECT value FROM meta WHERE key = ?').get(APPLY_EVENTS_PURGE_KEY) as
    | { value: string }
    | undefined;
  if (!last || Number(last.value) < now - 86_400_000) {
    db.prepare('DELETE FROM apply_events WHERE created_at < ?').run(now - APPLY_EVENTS_TTL_MS);
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
      APPLY_EVENTS_PURGE_KEY,
      String(now),
    );
  }
}

export function listApplyEvents(
  userId: number,
  limit = 100,
): { id: number; job_slug: string; kind: string; detail: string; created_at: number }[] {
  const size = Math.min(Math.max(1, Math.floor(limit)), 500);
  return db
    .prepare(
      'SELECT id, job_slug, kind, detail, created_at FROM apply_events WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    )
    .all(userId, size) as {
    id: number;
    job_slug: string;
    kind: string;
    detail: string;
    created_at: number;
  }[];
}
