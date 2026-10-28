import { db } from './db';
import { mskDayStartMs } from './moscow-day';
import { lastRefreshReport } from './catalog-refresh';
import { loadLastRun } from './autoapply-store';
import { isHhConnected } from './hh-oauth';
import {
  answerCallbackQuery,
  editTelegramMessage,
  escapeHtml,
  sendTelegramMessage,
  type InlineKeyboard,
} from './telegram';
import { commandKeyboard } from './telegram-keyboard';

/**
 * Админ-панель бота: только для владельца.
 *
 * Состав — read-only: пользователи, последний прогон, каталог, токены hh.
 * Кнопок, меняющих состояние (рассылка, перезапуск, ручной прогон), здесь
 * нет намеренно: одна ошибочная нажатая кнопка владельцем страшнее, чем
 * отсутствие кнопки вообще. Действиям место в кабинете с подтверждением.
 *
 * Невидимость — часть защиты: /admin нет в BOT_COMMANDS и меню BotFather,
 * чужой чат получает обычное «не знаю команду», неотличимое от опечатки.
 */

/**
 * Чат владельца: явный OWNER_ID, иначе общий админский чат.
 *
 * Два имени, потому что у них разный смысл: ADMIN_TELEGRAM_CHAT_ID — куда
 * слать уведомления владельцу (заявки, застой каталога), а OWNER_ID — кто
 * может открывать панель. По умолчанию совпадают.
 */
export function ownerChatId(): string | null {
  const explicit = process.env.OWNER_ID?.trim();
  if (explicit) return explicit;
  const admin = process.env.ADMIN_TELEGRAM_CHAT_ID?.trim();
  return admin ? admin : null;
}

/** Проверка доступа: без настроенного владельца панель закрыта для всех. */
export function isOwnerChat(chatId: string | number): boolean {
  const owner = ownerChatId();
  return Boolean(owner) && String(chatId) === owner;
}

function fmtTime(at: number): string {
  if (!at) return '—';
  return new Date(at).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Обзор: пользователи, тарифы, отклики сегодня, последний прогон.
 *
 * Только числа и собственные идентификаторы тарифов — никаких email,
 * токенов и chat_id: панель могут увидеть через плечо, а скриншот
 * с персональными данными уже не отозвать.
 */
export function adminOverviewText(now = Date.now()): string {
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  const linked = db.prepare('SELECT COUNT(*) AS c FROM users WHERE telegram_chat_id IS NOT NULL').get() as {
    c: number;
  };
  const plans = db
    .prepare('SELECT plan, COUNT(*) AS c FROM users GROUP BY plan ORDER BY c DESC')
    .all() as { plan: string; c: number }[];
  const today = (
    db
      .prepare('SELECT COUNT(*) AS c FROM applications WHERE sent_at >= ?')
      .get(mskDayStartMs(now)) as { c: number }
  ).c;
  const last = loadLastRun();
  const planLine =
    plans.length > 0 ? plans.map((p) => `${p.plan} ×${p.c}`).join(', ') : 'нет пользователей';
  const lastLine = last
    ? `Последний прогон: ${fmtTime(last.at)} — отправлено ${last.applied}, ошибок ${last.failed}`
    : 'Прогоны ещё не выполнялись';
  return [
    '<b>Админ-панель</b>',
    '',
    `Пользователи: ${users.c} (привязано TG: ${linked.c})`,
    `Тарифы: ${planLine}`,
    `Откликов сегодня: ${today}`,
    lastLine,
  ].join('\n');
}

/** Каталог: последний результат обновления под активные поиски. */
export function adminCatalogText(): string {
  const report = lastRefreshReport();
  if (!report) {
    return ['<b>Каталог</b>', '', 'Обновлений ещё не было.'].join('\n');
  }
  if (!report.ran) {
    return ['<b>Каталог</b>', '', `Не обновлялся: ${report.skipped ?? 'причина неизвестна'}`].join('\n');
  }
  const failed = report.statuses.filter((s) => !s.ok && !s.requiresSetup);
  const lines = [
    '<b>Каталог</b>',
    '',
    `Запросов: ${report.queries}, добавлено вакансий: ${report.added}`,
    `Источников с ошибкой: ${failed.length} из ${report.statuses.length}`,
    `Длительность: ${Math.round(report.durationMs / 1000)} с`,
  ];
  for (const s of failed.slice(0, 5)) {
    // Текст ошибки — снаружи (сеть, RSS-фид): без экранирования кривая
    // разметка роняла бы всё сообщение с html:true.
    lines.push(`— ${escapeHtml(s.source)}: ${escapeHtml((s.error ?? 'ошибка').slice(0, 80))}`);
  }
  return lines.join('\n');
}

/**
 * Токены hh: сколько подключено и сколько заведомо мёртвых.
 *
 * Условие мёртвых — то же, что в плановом обходе sendHhTokenWarnings
 * (срок прошёл, пути обновления нет): две копии одного WHERE расходятся
 * со временем, поэтому при правке условия править оба места.
 */
export function adminTokensText(): string {
  const rows = db
    .prepare(
      `SELECT hh_token, hh_token_expires_at, hh_refresh_token, hh_resume_id FROM users
       WHERE hh_token IS NOT NULL AND hh_token != ''`,
    )
    .all() as {
    hh_token: string;
    hh_token_expires_at: number | null;
    hh_refresh_token: string | null;
    hh_resume_id: string | null;
  }[];
  const connected = rows.filter((r) =>
    isHhConnected({
      hh_token: r.hh_token,
      hh_token_expires_at: r.hh_token_expires_at,
      hh_refresh_token: r.hh_refresh_token,
      hh_resume_id: r.hh_resume_id,
    }),
  ).length;
  const now = Date.now();
  const dead = rows.filter(
    (r) =>
      r.hh_resume_id &&
      r.hh_token_expires_at !== null &&
      r.hh_token_expires_at <= now &&
      !r.hh_refresh_token,
  ).length;
  return [
    '<b>Токены hh.ru</b>',
    '',
    `Подключено аккаунтов: ${connected} из ${rows.length}`,
    `Заведомо мёртвых (срок прошёл, обновления нет): ${dead}`,
    dead > 0 ? 'Им уже ушло предупреждение в Telegram.' : 'Предупреждать некого.',
  ].join('\n');
}

/** Переключение видов панели — все данные уже посчитаны выше, колбэки короткие. */
export function adminKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: 'Обзор', data: 'admin:overview' },
        { text: 'Каталог', data: 'admin:catalog' },
        { text: 'Токены', data: 'admin:tokens' },
      ],
    ],
  };
}

/**
 * Команда /admin: владельцу — панель, остальным — обычное «не знаю команду».
 *
 * Текст отказа намеренно совпадает с ответом на опечатку: подтверждать
 * существование панели чужому чату нельзя.
 */
export async function handleAdminMessage(chat: string): Promise<boolean> {
  if (!isOwnerChat(chat)) {
    return sendTelegramMessage(chat, 'Не знаю команду /admin.', {
      keyboard: commandKeyboard(),
    });
  }
  return sendTelegramMessage(chat, adminOverviewText(), {
    keyboard: adminKeyboard(),
    html: true,
  });
}

/** Кнопки панели: тоже только владелец, чужим — тихое «недоступно». */
export async function handleAdminCallback(
  chat: string,
  data: string,
  callbackId?: string,
  messageId?: number,
): Promise<boolean | null> {
  if (!isOwnerChat(chat)) {
    if (callbackId) await answerCallbackQuery(callbackId, { text: 'Недоступно' });
    return null;
  }
  const valid = data === 'admin:overview' || data === 'admin:catalog' || data === 'admin:tokens';
  if (!valid) {
    if (callbackId) await answerCallbackQuery(callbackId, { text: 'Кнопка устарела' });
    return null;
  }
  if (callbackId) await answerCallbackQuery(callbackId);
  const text =
    data === 'admin:catalog'
      ? adminCatalogText()
      : data === 'admin:tokens'
        ? adminTokensText()
        : adminOverviewText();
  if (messageId !== undefined) {
    const changed = await editTelegramMessage(chat, messageId, text, {
      keyboard: adminKeyboard(),
      html: true,
    });
    if (changed) return true;
  }
  return sendTelegramMessage(chat, text, { keyboard: adminKeyboard(), html: true });
}
