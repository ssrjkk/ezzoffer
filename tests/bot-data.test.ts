import test from "node:test";
import assert from "node:assert/strict";

import { BOT_COMMANDS, BOT_MESSAGES } from "../src/lib/bot-data";

/**
 * Секция Telegram-бота на лендинге обещает конкретные возможности, поэтому
 * данные диалога должны быть непустыми и непротиворечивыми: команды из
 * BOT_COMMANDS действительно встречаются в диалоге.
 */
test("диалог непустой и начинается с сообщения пользователя", () => {
  assert.ok(BOT_MESSAGES.length > 0, "диалог должен демонстрировать сценарий");
  assert.equal(BOT_MESSAGES[0].from, "user");
});

test("сообщения чередуются, бот не говорит дважды подряд", () => {
  for (let i = 1; i < BOT_MESSAGES.length; i++) {
    assert.notEqual(
      BOT_MESSAGES[i].from,
      BOT_MESSAGES[i - 1].from,
      `сообщения ${i - 1} и ${i} идут от одного отправителя`,
    );
  }
});

test("у каждого сообщения есть текст и пауза", () => {
  for (const [i, msg] of BOT_MESSAGES.entries()) {
    assert.ok(msg.text.trim().length > 0, `сообщение ${i} пустое`);
    assert.ok(msg.pauseAfterMs > 0, `у сообщения ${i} нет паузы`);
  }
});

test("все показанные команды реально встречаются в диалоге", () => {
  const userText = BOT_MESSAGES.filter((m) => m.from === "user")
    .map((m) => m.text)
    .join("\n");
  for (const cmd of BOT_COMMANDS) {
    assert.ok(
      userText.includes(`/${cmd.command}`) || userText.toLowerCase().includes(cmd.command),
      `команда /${cmd.command} не показана в диалоге`,
    );
  }
});

test("список команд уникален и описан", () => {
  const names = BOT_COMMANDS.map((c) => c.command);
  assert.equal(new Set(names).size, names.length, "команды не должны повторяться");
  for (const cmd of BOT_COMMANDS) {
    assert.ok(cmd.title.trim(), `у команды /${cmd.command} нет заголовка`);
    assert.ok(cmd.text.trim().length > 20, `у команды /${cmd.command} слишком короткое описание`);
  }
});

test("тексты не содержат незакрытых плейсхолдеров", () => {
  for (const msg of BOT_MESSAGES) {
    assert.ok(!msg.text.includes("{"), `в сообщении остался шаблон: ${msg.text}`);
  }
});

test("в боте заявлены паузы между откликами", () => {
  const text = BOT_MESSAGES.map((m) => m.text).join("\n");
  assert.ok(
    /45|180|секунд|пауз/i.test(text),
    "диалог должен упоминать человеческие паузы — это ключевое обещание сервиса",
  );
});