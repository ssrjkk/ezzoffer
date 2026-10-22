#!/usr/bin/env node
/**
 * Локальный опрос Telegram вместо вебхука.
 *
 * Telegram не достучится до localhost:3000, поэтому вместо setWebhook скрипт
 * крутит long-polling getUpdates и перекладывает каждый апдейт в тот же
 * /api/telegram/webhook, что и прод. Разбор идёт тем же кодом (inbox +
 * processInbox в тике планировщика) — локальный бот ведёт себя как продовый.
 *
 * Использование: TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node scripts/bot-poll.mjs
 * Остановка: Ctrl+C (снимает offset, дубликатов не будет — inbox держит PK).
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Минимальный парсер .env (без зависимостей) — тот же, что в start-prod.mjs.
 *
 * npm не подставляет .env сам (это делает `next dev`), а голый node читает
 * только process.env. Без этого поллер брал TELEGRAM_BOT_TOKEN из системного
 * окружения — а там может лежать протухший токен от другого бота, и getMe
 * отвечает 401, хотя .env в корне валиден. Явно заданные переменные важнее.
 */
function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(path.join(root, '.env'));
loadDotEnv(path.join(root, '.env.local'));

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const SECRET = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
const BASE = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const POLL_TIMEOUT_SEC = 30;

if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN не задан');
  process.exit(1);
}

const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout((POLL_TIMEOUT_SEC + 10) * 1000),
  }).then((r) => r.json());

async function main() {
  const me = await api('getMe');
  if (!me.ok) {
    console.error('getMe не удался:', JSON.stringify(me).slice(0, 200));
    process.exit(1);
  }
  console.log(`Бот: @${me.result.username} (${me.result.first_name})`);
  // Вебхук мешает getUpdates (409 Conflict) — снимаем.
  await api('deleteWebhook', { drop_pending_updates: false });
  console.log(`Опрос запущен, апдейты уходят на ${BASE}/api/telegram/webhook`);

  let offset = 0;
  for (;;) {
    let data;
    try {
      data = await api('getUpdates', { offset, timeout: POLL_TIMEOUT_SEC, allowed_updates: ['message', 'callback_query'] });
    } catch (err) {
      console.error('getUpdates сбой, пауза 5с:', err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (!data.ok) {
      console.error('getUpdates вернул не-ok, пауза 5с:', JSON.stringify(data).slice(0, 200));
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    for (const update of data.result ?? []) {
      offset = Math.max(offset, (update.update_id ?? 0) + 1);
      try {
        const res = await fetch(`${BASE}/api/telegram/webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Bot-Api-Secret-Token': SECRET,
          },
          body: JSON.stringify(update),
          signal: AbortSignal.timeout(15_000),
        });
        console.log(`update ${update.update_id} -> ${res.status}`);
      } catch (err) {
        console.error(`доставка update ${update.update_id} не удалась:`, err instanceof Error ? err.message : err);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
