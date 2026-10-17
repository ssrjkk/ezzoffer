import { db } from "../db";
import { catalogItem } from "./catalog";
import type { VerifiedEvent } from "./types";

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
 * Возвращает false, если платёж уже записан. Никогда не бросает и не
 * выдаёт права дважды — повторная доставка это норма, а не ошибка.
 */
export function grant(event: VerifiedEvent): boolean {
  const item = catalogItem(event.planId);
  if (!item) return false;

  const existing = db
    .prepare("SELECT id FROM payments WHERE external_id = ?")
    .get(event.externalId) as { id: number } | undefined;
  if (existing) return false;

  const now = event.paidAt || Date.now();
  const expiresAt = item.permanent ? null : now + item.days * 86_400_000;

  const applied = db.transaction(() => {
    db.prepare(
      `INSERT INTO payments (user_id, external_id, provider, plan_id, amount_rub, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(event.userId, event.externalId, event.method, event.planId, event.amountRub, now);

    db.prepare(
      `INSERT INTO entitlements (user_id, plan_id, source_payment_id, expires_at, created_at)
       VALUES (?, ?, (SELECT id FROM payments WHERE external_id = ?), ?, ?)`,
    ).run(event.userId, event.planId, event.externalId, expiresAt, now);

    /*
     * users.plan обновляется здесь же, потому что весь продукт читает именно
     * его. Постоянный тариф ставит plan_expires_at в NULL — «вечно» не может
     * значить «через год».
     */
    db.prepare("UPDATE users SET plan = ?, plan_period = ?, plan_expires_at = ? WHERE id = ?").run(
      event.planId,
      item.permanent ? 0 : item.days,
      expiresAt,
      event.userId,
    );
    return true;
  })();

  return applied;
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
    .prepare("SELECT * FROM entitlements WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as Entitlement[];
}