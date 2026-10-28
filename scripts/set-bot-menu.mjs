#!/usr/bin/env node
/**
 * Меню, описание и короткое описание бота (setMyCommands и соседи).
 *
 * Хранится на стороне Telegram, а не в коде: выполняется один раз после
 * изменения списка команд. Без этого у бота нет кнопки меню — человек обязан
 * помнить синтаксис, а промах по цифре в «/отклик 2» означает чужую вакансию.
 * Команды меню — латиницей: кириллицу Bot API в command не принимает.
 *
 * Использование: TELEGRAM_BOT_TOKEN=... node scripts/set-bot-menu.mjs
 * (.env подхватывается автоматически, явные переменные важнее).
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const file of [path.join(root, '.env'), path.join(root, '.env.local')]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN не задан');
  process.exit(1);
}

const COMMANDS = [
  { command: 'podbor', description: 'Вакансии по вашим поискам' },
  { command: 'otklik', description: 'Откликнуться: /otklik 2' },
  { command: 'statistika', description: 'Воронка откликов' },
  { command: 'sobesedovanie', description: 'Подготовка к собеседованию' },
  { command: 'izbrannoe', description: 'Отложенные вакансии' },
  { command: 'sovety', description: 'Что делать дальше' },
  { command: 'navyki', description: 'Пробелы в навыках' },
  { command: 'svyazat', description: 'Привязать аккаунт: /svyazat <код>' },
  { command: 'pauza', description: 'Остановить отправку' },
  { command: 'start', description: 'Продолжить и статус' },
];

const DESCRIPTION =
  'EZOffer: подбор вакансий и автоотклики на hh.ru. Привяжите аккаунт из кабинета командой /svyazat <код>.';
const SHORT = 'Автоотклики на hh.ru из Telegram';

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log(method, data.ok ? 'OK' : JSON.stringify(data).slice(0, 200));
  if (!data.ok) process.exitCode = 1;
}

await call('setMyCommands', { commands: COMMANDS });
await call('setMyDescription', { description: DESCRIPTION });
await call('setMyShortDescription', { short_description: SHORT });
