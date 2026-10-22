import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { telegramConfigured, telegramWebhookSecret, purgeExpiredCodes } from '@/lib/telegram';
import { processInbox, type TelegramUpdate } from '@/lib/telegram-bot';
import { logError, logInfo } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Разбудить разбор очереди вне тика.
 *
 * По умолчанию включён (`TELEGRAM_FAST_PATH`, отключается значением '0'):
 * после ответа 200 очередь разбирается сразу, и бот отвечает за секунды, а не
 * к следующему тику (минуты). Безопасность та же, что у тика: заявки
 * разбираются через claim, двойной обработки нет, а тик остаётся страховкой
 * (если процесс умрёт между ответом и разбором). Ошибка здесь не роняет
 * ничего: ответ уже ушёл, тик подберёт заявку позже.
 *
 * На бессерверном хостинге (ответ = смерть процесса) выключайте в '0' —
 * там работает только тик.
 */
function wakeInbox(): void {
  if (process.env.TELEGRAM_FAST_PATH === '0') return;
  void processInbox().catch((err) => logError('telegram:wake', err));
}

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
  // Теперь маршрут отвечает 200 сразу после записи, а разбор идёт следом
  // в фоне (wakeInbox) и в тике планировщика (processInbox). Повторный
  // update_id отклоняется первичным ключом — это и есть дедупликация,
  // единой точкой.
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

  // Ответ уходит раньше разбора: Telegram видит быстрый 200 и не ретраит,
  // а wakeInbox разбирает очередь следом в фоне того же процесса.
  const res = Response.json({ ok: true });
  wakeInbox();
  return res;
}

/** Статус настройки: удобно для дашборда и healthcheck. */
export async function GET() {
  return Response.json({
    configured: telegramConfigured(),
    webhook: Boolean(telegramWebhookSecret()),
  });
}
