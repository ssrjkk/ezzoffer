import { NextResponse } from 'next/server';
import { requireUser, unauthorized, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { NO_STORE_HEADERS } from '@/lib/http';
import { logError } from '@/lib/logger';

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const rows = db
    .prepare('SELECT * FROM consultations WHERE user_id = ? ORDER BY booked_at DESC')
    .all(user.id);
  return Response.json({ consultations: rows }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const limiter = rateLimit(`consultations:${user.id}`, { windowMs: 60 * 60 * 1000, max: 5 });
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'Слишком много заявок. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } },
    );
  }

  const { data, error } = await readJson<{ theme?: string; note?: string }>(request);
  if (error) return error;
  if (!data?.theme?.trim()) {
    return NextResponse.json({ error: 'Выберите тему консультации' }, { status: 400 });
  }
  const result = db
    .prepare('INSERT INTO consultations (user_id, theme, note, booked_at) VALUES (?, ?, ?, ?)')
    .run(
      user.id,
      data.theme.trim().slice(0, 120),
      (data.note ?? '').trim().slice(0, 2000),
      Date.now(),
    );
  const row = db.prepare('SELECT * FROM consultations WHERE id = ?').get(result.lastInsertRowid);

  /*
   * Заявка обязана дойти до человека, а не лечь в таблицу, которую никто не
   * читает. Уведомление уходит админу в Telegram — best-effort: бот может
   * быть не настроен, и тогда заявка просто ждёт в кабинете (видно по
   * `done = 0`). Ошибка отправки не валит запись: потерять заявку хуже,
   * чем не уведомить о ней вовремя.
   */
  try {
    const { sendTelegramMessage } = await import('@/lib/telegram');
    const admin = (process.env.ADMIN_TELEGRAM_CHAT_ID ?? '').trim();
    if (admin) {
      const theme = String(data.theme ?? '').trim().slice(0, 120);
      await sendTelegramMessage(
        admin,
        [
          'Новая заявка на консультацию',
          `Тема: ${theme}`,
          `От: ${user.name || user.email} (id ${user.id})`,
          (data.note ?? '').trim()
            ? `Комментарий: ${String(data.note).trim().slice(0, 500)}`
            : 'Без комментария.',
        ].join('\n'),
      );
    }
  } catch (err) {
    logError('consultations:notify', err instanceof Error ? err : new Error(String(err)), {
      userId: user.id,
    });
  }
  return Response.json({ consultation: row }, { status: 201, headers: NO_STORE_HEADERS });
}

/** Отметка «проведена» — только своя заявка, чужую закрыть нельзя. */
export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { data, error } = await readJson<{ id?: number; done?: boolean }>(request);
  if (error) return error;
  const id = Number(data?.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Некорректный идентификатор' }, { status: 400 });
  }
  const res = db
    .prepare('UPDATE consultations SET done = ? WHERE id = ? AND user_id = ?')
    .run(data?.done ? 1 : 0, id, user.id);
  if (res.changes === 0) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }
  const row = db.prepare('SELECT * FROM consultations WHERE id = ?').get(id);
  return Response.json({ consultation: row }, { headers: NO_STORE_HEADERS });
}
