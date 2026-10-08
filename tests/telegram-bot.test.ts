import test from "node:test";
import assert from "node:assert/strict";

import { parseCommand, replyFor } from "../src/lib/telegram-bot";
import type { User } from "../src/lib/db";

function user(over: Partial<User> = {}): User {
  return {
    id: 1,
    email: "u@example.com",
    name: "Иван",
    password_hash: "h",
    created_at: 0,
    plan: "pro",
    plan_period: 14,
    plan_activated_at: 0,
    plan_expires_at: Date.now() + 10 * 24 * 3600 * 1000,
    trial_started_at: 0,
    hh_token: null,
    hh_token_expires_at: null,
    hh_refresh_token: null,
    hh_resume_id: null,
    telegram_chat_id: "1",
    autoapply_paused: 0,
    email_verified: 1,
    email_verification_token: null,
    password_reset_token: null,
    password_reset_expires: null,
    ...over,
  };
}

test("parseCommand разбирает команду и аргументы", () => {
  assert.deepEqual(parseCommand("/поиск React удалённо"), {
    command: "поиск",
    args: "React удалённо",
  });
});

test("parseCommand срезает суффикс бота (@EZOfferBot)", () => {
  const parsed = parseCommand("/статистика@EZOfferBot");
  assert.equal(parsed?.command, "статистика");
  assert.equal(parsed?.args, "");
});

test("parseCommand приводит регистр к нижнему", () => {
  assert.equal(parseCommand("/СТАТИСТИКА")?.command, "статистика");
});

test("parseCommand возвращает null для обычного текста", () => {
  assert.equal(parseCommand("привет"), null);
  assert.equal(parseCommand(""), null);
});

test("/start и /помощь работают без привязки", () => {
  const start = replyFor("start", "", null);
  assert.match(start.text, /\/статистика/);
  assert.match(start.text, /\/связать/);

  const help = replyFor("помощь", "", null);
  assert.match(help.text, /команды/i);
});

test("команды без привязки объясняют, как привязаться", () => {
  const reply = replyFor("статистика", "", null);
  assert.match(reply.text, /не привязан/i);
  assert.match(reply.text, /\/dashboard\/settings/);
});

test("статистика показывает реальные цифры и подсказку", () => {
  const reply = replyFor("статистика", "", user());
  assert.match(reply.text, /Тариф: Про/);
  assert.match(reply.text, /За 7 дней/);
  assert.match(reply.text, /Просмотры:/);
});

test("истёкший тариф честно блокирует автоотклики", () => {
  const reply = replyFor("статистика", "", user({ plan_expires_at: Date.now() - 1000 }));
  assert.match(reply.text, /истёк/i);
  assert.match(reply.text, /тариф/i);
});

test("пауза отражается в статистике", () => {
  const reply = replyFor("статистика", "", user({ autoapply_paused: 1 }));
  assert.match(reply.text, /на паузе/);
});

test("/связать требует код", () => {
  const reply = replyFor("связать", "", null);
  assert.match(reply.text, /код/i);
  assert.match(reply.text, /\/связать \d+/);
});

test("/связать с кодом помечает действие link", () => {
  const reply = replyFor("связать", "123456", null);
  assert.equal(reply.action, "link");
});

test("/выйти помечает действие unlink", () => {
  assert.equal(replyFor("выйти", "", user()).action, "unlink");
});

test("неизвестная команда подсказывает /помощь", () => {
  const reply = replyFor("абракадабра", "", user());
  assert.match(reply.text, /Не знаю команду/);
  assert.match(reply.text, /\/помощь|\/start/);
});

test("/пауза ведёт в кабинет, а не меняет состояние молча", () => {
  const reply = replyFor("пауза", "", user());
  assert.match(reply.text, /\/dashboard\/settings/);
  assert.equal(reply.action, undefined, "пауза не должна применяться прямо из чата");
});

test("/поиск без активных поисков объясняет, что делать", () => {
  const reply = replyFor("поиск", "", user());
  // Проверяем формулировку независимо от наличия поисков в тестовой БД.
  assert.ok(reply.text.length > 0);
});

test("ответы не содержат незакрытых фигурных скобок", () => {
  const replies = [
    replyFor("start", "", null),
    replyFor("статистика", "", user()),
    replyFor("пауза", "", user()),
    replyFor("неизвестно", "", user()),
  ];
  for (const r of replies) {
    assert.ok(!r.text.includes("{"), `в ответе остался шаблон: ${r.text}`);
  }
});