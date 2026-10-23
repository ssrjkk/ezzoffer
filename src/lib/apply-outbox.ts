import { db } from './db';
import { isUniqueViolation } from './validate';

/**
 * Outbox намерений отправить отклик.
 *
 * Закрывает последнее окно, где внешний эффект мог потеряться: сбой между
 * успешным POST в hh и записью в applications. Без outbox такая отправка
 * исчезала из истории молча (повторная отправка при этом безопасна:
 * hh отвечает already_applied, и вакансия закрывается gracefully).
 *
 * Порядок один везде: claim (INSERT pending) → сеть → INSERT applications →
 * complete (DELETE заявки). Запись в applications остаётся единственным
 * источником правды для статистики, квот и дайджестов: outbox читают только
 * отправляющий код и сборщик протухших.
 *
 * Отдельная таблица, а не статус в applications, — намеренно: ни один SELECT
 * статистики, квот, подборок и дайджестов менять не пришлось. Кто читает
 * только applications, тот протухших заявок не видит вообще.
 */

export type OutboxClaim = { id: number };

/** Протухшие заявки старше этого считаются брошенными и подчищаются. */
export const OUTBOX_STALE_MS = 30 * 60 * 1000;

/**
 * Занять намерение отправить. Дубликат (та же связка уже отправляется) —
 * не ошибка, а сигнал «уже в работе»: вызывающий код сам решает, что сказать.
 */
export function claimSend(input: {
  userId: number;
  jobSlug: string;
  resumeId: string | null;
  letterId: number | null;
  message: string;
  searchId?: number | null;
}): OutboxClaim | { duplicate: true } {
  try {
    return doClaim(input);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    /*
     * Дубликат протухшей заявки: процесс умер между claim и complete, а
     * сборщик планировщика не добежал (автоотклики выключены, тарифа нет —
     * runAutoApply вообще не ходит). Без этого ручная кнопка вечно отвечала
     * бы «отправка уже идёт», хотя отправлять некому.
     *
     * Забираем только протухшую (старше OUTBOX_STALE_MS): свежая — это живой
     * параллельный прогон, её трогать нельзя. Гонка двух подбирающих: оба
     * DELETE, один INSERT выигрывает, второй получает второй UNIQUE и
     * честный duplicate — повторной отправки нет.
     */
    const stale = db
      .prepare('SELECT id, created_at FROM apply_outbox WHERE user_id = ? AND job_slug = ?')
      .get(input.userId, input.jobSlug) as { id: number; created_at: number } | undefined;
    if (!stale || stale.created_at > Date.now() - OUTBOX_STALE_MS) return { duplicate: true };
    db.prepare('DELETE FROM apply_outbox WHERE id = ?').run(stale.id);
    try {
      return doClaim(input);
    } catch (retryErr) {
      if (isUniqueViolation(retryErr)) return { duplicate: true };
      throw retryErr;
    }
  }
}

function doClaim(input: {
  userId: number;
  jobSlug: string;
  resumeId: string | null;
  letterId: number | null;
  message: string;
  searchId?: number | null;
}): OutboxClaim {
  const result = db
    .prepare(
      `INSERT INTO apply_outbox (user_id, job_slug, resume_id, letter_id, message, search_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.jobSlug,
      input.resumeId,
      input.letterId,
      input.message,
      input.searchId ?? null,
      Date.now(),
    );
  return { id: Number(result.lastInsertRowid) };
}

/** Заявка выполнена (успех или отказ площадки): строка больше не нужна. */
export function completeSend(id: number): void {
  db.prepare('DELETE FROM apply_outbox WHERE id = ?').run(id);
}

/**
 * Подчистить брошенные заявки: процесс умер между claim и complete.
 * Возвращает их для журнала — молча удалять чужую работу нельзя.
 *
 * Различаем два случая: если строка applications уже есть, отправка состоялась
 * (упали между INSERT и completeSend) — тихо подчищаем заявку. Если строки
 * нет — отправка потеряна: такие возвращаем вызывающему, чтобы он записал
 * их в журнал как expired. Повторная отправка при этом безопасна: hh ответит
 * already_applied, и вакансия закроется gracefully.
 */
export function sweepStaleOutbox(
  now: number = Date.now(),
): { userId: number; jobSlug: string; lost: boolean }[] {
  const stale = db
    .prepare(
      `SELECT o.id, o.user_id, o.job_slug,
              EXISTS(SELECT 1 FROM applications a
                     WHERE a.user_id = o.user_id AND a.job_slug = o.job_slug AND a.withdrawn = 0) AS done
       FROM apply_outbox o WHERE o.created_at <= ?`,
    )
    .all(now - OUTBOX_STALE_MS) as {
    id: number;
    user_id: number;
    job_slug: string;
    done: number;
  }[];
  if (stale.length === 0) return [];
  const ids = stale.map((r) => r.id);
  db.prepare(`DELETE FROM apply_outbox WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  return stale.map((r) => ({ userId: r.user_id, jobSlug: r.job_slug, lost: r.done === 0 }));
}
