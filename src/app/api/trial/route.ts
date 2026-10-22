import { NextResponse } from 'next/server';
import { requireUser, unauthorized } from '@/lib/api';
import { db, type User } from '@/lib/db';
import { isPlanActive } from '@/lib/plans';

const TRIAL_MS = 24 * 60 * 60 * 1000;

export async function POST() {
  const user = await requireUser();
  if (!user) return unauthorized();

  /*
   * Запись — условным UPDATE, а не парой «проверить, потом записать».
   *
   * Раньше check (`trial_started_at`, isPlanActive) и UPDATE шли раздельно:
   * два параллельных запроса оба видели «пробника не было» и оба его
   * активировали. Теперь условие живёт в WHERE: второй запрос обновит ноль
   * строк и получит 409.
   *
   * Вечный тариф отсекается до UPDATE через каталог: в SQL его не выразить,
   * «постоянный» — свойство каталога, а не строки. Проверка через isPlanActive
   * осталась — пробник по-прежнему не сносит оплаченное «навсегда».
   */
  const fresh = db
    .prepare('SELECT plan, plan_expires_at, trial_started_at FROM users WHERE id = ?')
    .get(user.id) as
    { plan: string; plan_expires_at: number | null; trial_started_at: number | null } | undefined;
  if (fresh && isPlanActive(fresh)) {
    return NextResponse.json(
      { error: fresh.trial_started_at ? 'Пробный период уже был активирован' : 'У вас уже активен тариф' },
      { status: 409 },
    );
  }

  const now = Date.now();
  const res = db
    .prepare(
      `UPDATE users SET plan = 'trial', plan_period = 1, plan_activated_at = ?, plan_expires_at = ?, trial_started_at = ?
       WHERE id = ? AND trial_started_at IS NULL AND (plan_expires_at IS NULL OR plan_expires_at <= ?)`,
    )
    .run(now, now + TRIAL_MS, now, user.id, now);
  if (res.changes === 0) {
    // Условный UPDATE ничего не обновил: второй параллельный запрос успел
    // первым, либо тариф активен. Перечитываем, чтобы ответить точно.
    const cur = db
      .prepare('SELECT trial_started_at FROM users WHERE id = ?')
      .get(user.id) as { trial_started_at: number | null } | undefined;
    if (!cur) {
      return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
    }
    return NextResponse.json(
      { error: cur.trial_started_at ? 'Пробный период уже был активирован' : 'У вас уже активен тариф' },
      { status: 409 },
    );
  }

  // Строка пользователя теоретически может исчезнуть между проверкой сессии и
  // записью (удалили аккаунт, восстановили БД из бэкапа). Раньше здесь стояло
  // `as User`, и при отсутствии строки `updated.plan` бросал TypeError —
  // клиент получал 500 вместо внятного ответа. Отвечаем 401: сессия больше
  // недействительна, пусть перезайдёт.
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as User | undefined;
  if (!updated) {
    return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
  }
  return Response.json({
    plan: {
      id: updated.plan,
      expires_at: updated.plan_expires_at,
      trial_started_at: updated.trial_started_at,
    },
  });
}
