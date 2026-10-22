import { db } from '../db';
import { logError } from '../logger';
import { catalogItem } from './catalog';
import type { VerifiedEvent } from './types';

/**
 * Права доступа по факту оплаты.
 *
 * Права хранятся отдельно от users.plan сознательно. `plan` — это то, чем
 * пользователь пользуется сейчас, и он перезаписывается пробным периодом,
 * отменой и любым будущим переходом. История оплат — это другое: она не
 * переписывается никогда, и именно из неё видно, что человек заплатил.
 *
 * Идемпотентность по external_id: провайдеры любят доставлять вебхук дважды
 * (и не зря), и вторая доставка не должна ни продлевать подписку ещё на раз,
 * ни падать.
 */

export type Entitlement = {
  id: number;
  user_id: number;
  plan_id: string;
  method: string;
  expires_at: number | null;
  created_at: number;
};

/**
 * Выдать права по подтверждённому событию.
 *
 * Возвращает false, если платёж уже записан или записать нельзя. Никогда не
 * бросает детерминированные ошибки (гонка двух доставок, нет пользователя):
 * повторная доставка — норма, а исключение из grant превращалось в 500 на
 * вебхуке, и провайдер слал poison-сообщение вечно.
 *
 * Временные ошибки БД (SQLITE_BUSY, диск) — исключение: они пробрасываются,
 * вебхук отвечает 5xx, и провайдер повторяет доставку. Глотать их в false
 * означало бы «оплата потеряна навсегда» с кодом 200.
 */
export function grant(event: VerifiedEvent): boolean {
  const item = catalogItem(event.planId);
  if (!item) return false;

  /*
   * Идемпотентность — по паре (провайдер, внешний id), а не по голому id.
   *
   * Раньше проверка шла только по external_id, а он в схеме UNIQUE глобально.
   * Формат paymentId задаёт внешняя сторона, и два разных способа оплаты
   * вправе выдать одинаковый номер: тогда второй (легитимный) платёж
   * отклонялся как «уже записан», а человек оставался без тарифа за свои
   * деньги. Пара (provider, external_id) — это настоящий ключ события.
   */
  const existing = db
    .prepare('SELECT id FROM payments WHERE provider = ? AND external_id = ?')
    .get(event.method, event.externalId) as { id: number } | undefined;
  if (existing) return false;

  /*
   * Время оплаты ограничивается сверху текущим.
   *
   * paidAt приходит снаружи (подпись подтверждает авторство, а не честность
   * часов), и срок подписки считается от него: paidAt из будущего продлевал
   * бы подписку из воздуха. В прошлое ограничение не ставится: вебхук вправе
   * опоздать, и честная задержка не должна съедать оплаченные дни.
   */
  const now = Date.now();
  const paidAt =
    Number.isFinite(event.paidAt) && event.paidAt > 0 ? Math.min(event.paidAt, now) : now;
  /*
   * Продление — от текущего срока, а не перезапись.
   *
   * Раньше expiresAt всегда считался от paidAt: раннее продление того же
   * тарифа сжигало остаток («было 20 дней, купил ещё 30 — стало 30 вместо
   * 50»), а оплата другого тарифа поверх активного молча роняла оплаченные
   * дни. Теперь живой остаток того же плана сохраняется.
   *
   * Чтение — ВНУТРИ транзакции: SELECT до неё видел остаток, который
   * параллельная доставка уже продлила, и второй платёж того же плана
   * терял дни (оба считали от одного R). SQLite-транзакции сериализуемы,
   * второй писатель ждёт первого и видит свежий остаток.
   */
  let applied = false;
  try {
    db.transaction(() => {
      const current = db
        .prepare('SELECT plan, plan_expires_at FROM users WHERE id = ?')
        .get(event.userId) as
        | { plan: string; plan_expires_at: number | null }
        | undefined;
      const liveRemainder =
        current && current.plan === event.planId && (current.plan_expires_at ?? 0) > paidAt
          ? (current.plan_expires_at as number)
          : paidAt;
      const expiresAt = item.permanent ? null : liveRemainder + item.days * 86_400_000;

      db.prepare(
        `INSERT INTO payments (user_id, external_id, provider, plan_id, amount_rub, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(event.userId, event.externalId, event.method, event.planId, event.amountRub, paidAt);

      db.prepare(
        `INSERT INTO entitlements (user_id, plan_id, source_payment_id, expires_at, created_at)
         VALUES (?, ?, (SELECT id FROM payments WHERE provider = ? AND external_id = ?), ?, ?)`,
      ).run(event.userId, event.planId, event.method, event.externalId, expiresAt, paidAt);

      /*
       * Ранний возврат ждал эту оплату: гасим выданные права сразу.
       *
       * Без этого refund-before-paid терялся, а paid выдавал действующий тариф
       * за возвращённые деньги. Права закрываются той же меткой времени, что и
       * оплата — в истории видно и то, и другое.
       */
      const pending = db
        .prepare('DELETE FROM pending_refunds WHERE provider = ? AND external_id = ? RETURNING user_id, plan_id')
        .get(event.method, event.externalId) as
        { user_id: number; plan_id: string } | undefined;
      if (pending && pending.user_id === event.userId && pending.plan_id === event.planId) {
        db.prepare(
          `UPDATE entitlements SET expires_at = ?
           WHERE source_payment_id = (SELECT id FROM payments WHERE provider = ? AND external_id = ?)`,
        ).run(paidAt, event.method, event.externalId);
      }

      /*
       * Витрина users.plan — по лучшему остатку, а не по последнему платежу.
       *
       * Оплата другого тарифа поверх активного раньше молча роняла оплаченные
       * дни (активный Expert + оплата Start = витрина Start). Теперь побеждает
       * вечный тариф, иначе самый дальний срок: человек пользуется лучшим из
       * того, за что заплатил.
       */
      syncUserPlan(event.userId);
    })();
    applied = true;
  } catch (err) {
    rethrowTransient(err);
    /*
     * Сюда попадают детерминированные ошибки: нет такого пользователя (FK),
     * гонка двух доставок (UNIQUE). Бросать их наружу — значит отвечать 500 и
     * получать то же сообщение снова: poison-доставка крутилась бы вечно.
     * Возвращаем false, роут отвечает 200 с applied:false, причина — в логе.
     */
    logError('payments:grant', err instanceof Error ? err : new Error(String(err)), {
      externalId: event.externalId,
      userId: event.userId,
    });
  }

  return applied;
}

/**
 * Витрина users.plan — по лучшему действующему праву.
 *
 * Постоянный тариф важнее любого срочного (срок у него NULL — «вечно» не
 * может значить «через год»), из срочных побеждает самый дальний. Используют
 * и grant, и revoke: выдача и возврат — две стороны одного пересчёта, и второй
 * путь с собственной формулой уже ошибался (MAX игнорировал NULL).
 */
export function syncUserPlan(userId: number): void {
  const now = Date.now();
  const best = db
    .prepare(
      `SELECT plan_id, expires_at FROM entitlements
       WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY expires_at IS NULL DESC, expires_at DESC LIMIT 1`,
    )
    .get(userId, now) as { plan_id: string; expires_at: number | null } | undefined;
  if (best) {
    const item = catalogItem(best.plan_id);
    db.prepare('UPDATE users SET plan = ?, plan_period = ?, plan_expires_at = ? WHERE id = ?').run(
      best.plan_id,
      item?.permanent ? 0 : (item?.days ?? 0),
      best.expires_at,
      userId,
    );
    return;
  }
  /*
   * Платных прав не осталось — но мог остаться живой пробник. Триал не
   * является entitlement (выдаёт его /api/trial, а не вебхук), поэтому
   * наивный сброс в 'none' убивал его: человек на пробнике покупал Pro,
   * возвращал Pro — и оставался вообще без тарифа, хотя сутки пробника
   * ещё не вышли. Возвращаем trial, если его срок жив.
   */
  const trial = db.prepare('SELECT trial_started_at FROM users WHERE id = ?').get(userId) as {
    trial_started_at: number | null;
  } | undefined;
  if (trial?.trial_started_at && trial.trial_started_at + 86_400_000 > now) {
    db.prepare(
      "UPDATE users SET plan = 'trial', plan_period = 1, plan_expires_at = ? WHERE id = ?",
    ).run(trial.trial_started_at + 86_400_000, userId);
    return;
  }
  db.prepare("UPDATE users SET plan = 'none', plan_expires_at = NULL WHERE id = ?").run(userId);
}

/** Временные ошибки БД нельзя глотать: провайдер должен повторить доставку. */
export function rethrowTransient(err: unknown): void {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (
    code === 'SQLITE_BUSY' ||
    code === 'SQLITE_LOCKED' ||
    code === 'SQLITE_IOERR' ||
    code === 'SQLITE_FULL'
  ) {
    throw err;
  }
}

/**
 * Отзыв прав по возврату.
 *
 * Закрывает только права, выданные ЭТИМ платежом (по source_payment_id), —
 * а не все права плана. У человека может быть два платежа за один план
 * (продление): возврат одного не должен убивать второй, за который деньги
 * не возвращались.
 *
 * Журнал payments не трогается: возврат — это тоже событие истории, а не
 * отмена прошлого.
 *
 * Возвращает false, если отзывать нечего (платежа не было или права уже
 * закрыты). Как и grant, не бросает: повторная доставка — норма.
 */
export function revoke(event: VerifiedEvent): boolean {
  try {
    return db.transaction(() => {
      const payment = db
        .prepare('SELECT id, user_id, plan_id FROM payments WHERE provider = ? AND external_id = ?')
        .get(event.method, event.externalId) as
        { id: number; user_id: number; plan_id: string } | undefined;
      if (!payment) {
        /*
         * Платежа ещё нет — возможно, это возврат раньше оплаты (порядок
         * доставок при ретраях). Не отбрасываем молча: кладём в
         * pending_refunds, и grant погасит права сразу при выдаче. Чистим
         * протухшие (старше 30 дней): оплата, не пришедшая за месяц, уже не
         * придёт, а таблица не должна расти монотонно.
         *
         * Чужой платёж (есть, но не наш) сюда не попадает: ниже — молча false
         * без записи, иначе чужим external_id можно было бы гасить чужие права.
         */
        db.prepare(
          `INSERT OR IGNORE INTO pending_refunds (provider, external_id, user_id, plan_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(event.method, event.externalId, event.userId, event.planId, Date.now());
        db.prepare('DELETE FROM pending_refunds WHERE created_at <= ?').run(
          Date.now() - 30 * 86_400_000,
        );
        return false;
      }
      if (payment.user_id !== event.userId || payment.plan_id !== event.planId) {
        return false;
      }

      const now = Date.now();
      const closed = db
        .prepare(
          `UPDATE entitlements SET expires_at = ?
           WHERE source_payment_id = ? AND (expires_at IS NULL OR expires_at > ?)`,
        )
        .run(now, payment.id, now);
      if (closed.changes === 0) return false;

      // Витрина — по лучшему остатку (общий пересчёт с grant, см. syncUserPlan).
      syncUserPlan(event.userId);
      return true;
    })();
  } catch (err) {
    rethrowTransient(err);
    logError('payments:revoke', err instanceof Error ? err : new Error(String(err)), {
      externalId: event.externalId,
      userId: event.userId,
    });
    return false;
  }
}

/** Есть ли у человека хоть одно действующее право. */
export function hasActiveEntitlement(userId: number): boolean {
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM entitlements
       WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .get(userId, now) as { c: number };
  return row.c > 0;
}

export function listEntitlements(userId: number): Entitlement[] {
  return db
    .prepare('SELECT * FROM entitlements WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as Entitlement[];
}
