import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { telegramConfigured, telegramWebhookSecret, purgeExpiredCodes } from '@/lib/telegram';
import type { TelegramUpdate } from '@/lib/telegram-bot';
import { logInfo } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Webhook Telegram.
 *
 * Защита — заголовок X-Telegram-Bot-Api-Secret-Token, который задаётся при
 * регистрации webhook (setWebhook с secret_token). Без него любой желающий
 * мог бы слать апдейты от имени бота и привязывать чаты к аккаунтам.
 */
export async function POST(request: Request) {
  const secret = telegramWebhookSecret();
  if (!secret) {
    return NextResponse.json({ error: 'TELEGRAM_WEBHOOK_SECRET не настроен' }, { status: 503 });
  }
  /*
   * Сравнение по константному времени.
   *
   * Обычный `!==` выходит на первом же несовпавшем байте, и время ответа
   * зависит от того, сколько начальных байт угадано. Секрет — длинная
   * случайная строка, и снять его по времени через интернет нереально, но
   * timingSafeEqual стоит одну строку и убирает вопрос целиком. Неравная
   * длина отклоняется заранее: timingSafeEqual на разной длине бросает.
   */
  const got = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  const expected = Buffer.from(secret, 'utf8');
  const actual = Buffer.from(got, 'utf8');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: 'Не авторизовано' }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  // Только приём в очередь — никакой обработки в запросе.
  //
  // Раньше handleUpdate выполнялся прямо здесь: ответ зависел от сетевых
  // вызовов (ответ пользователю, hh-запросы из /отклик), и долгий ответ
  // приводил к ретраям Telegram, а ретраи — к риску отключения вебхука.
  // Теперь разбор идёт в тике планировщика (processInbox), а маршрут
  // отвечает 200 сразу после записи. Повторный update_id отклоняется
  // первичным ключом — это и есть дедупликация, единой точкой.
  if (typeof update.update_id !== 'number') {
    return Response.json({ ok: true });
  }
  const stored = db
    .prepare(
      'INSERT OR IGNORE INTO tg_inbox (update_id, body, received_at) VALUES (?, ?, ?)',
    )
    .run(update.update_id, JSON.stringify(update).slice(0, 20000), Date.now());
  if (stored.changes === 0) {
    return Response.json({ ok: true, duplicate: true });
  }
  // Чистка обработанных старше суток — раз в ~100 апдейтов, не на каждом.
  if (update.update_id % 100 === 0) {
    db.prepare('DELETE FROM tg_inbox WHERE done_at IS NOT NULL AND done_at < ?').run(
      Date.now() - 24 * 60 * 60 * 1000,
    );
  }
  logInfo('telegram', update.callback_query ? 'нажатие кнопки' : 'апдейт в очереди', {
    updateId: update.update_id,
  });
  purgeExpiredCodes();

  return Response.json({ ok: true });
}

/** Статус настройки: удобно для дашборда и healthcheck. */
export async function GET() {
  return Response.json({
    configured: telegramConfigured(),
    webhook: Boolean(telegramWebhookSecret()),
  });
}
