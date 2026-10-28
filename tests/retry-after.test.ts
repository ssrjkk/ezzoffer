import test, { before } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Retry-After в интерфейсе: секунды из заголовка → человеческая фраза.
 *
 * Форма входа показывала голое «слишком много попыток» без срока, и человек
 * жал «Войти» снова — получая тот же 429. Сервер срок знает (заголовок
 * Retry-After на всех 429 лимитера), клиент его теперь показывает словами.
 */

let parseRetryAfter: typeof import('../src/lib/retry-after').parseRetryAfter;
let humanRetryDelay: typeof import('../src/lib/retry-after').humanRetryDelay;

before(async () => {
  const mod = await import('../src/lib/retry-after');
  parseRetryAfter = mod.parseRetryAfter;
  humanRetryDelay = mod.humanRetryDelay;
});

test('parseRetryAfter: число проходит, мусор — null', () => {
  assert.equal(parseRetryAfter('90'), 90);
  assert.equal(parseRetryAfter('  30 '), 30);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter(''), null);
  assert.equal(parseRetryAfter('soon'), null);
  assert.equal(parseRetryAfter('0'), null);
  assert.equal(parseRetryAfter('-5'), null);
});

test('parseRetryAfter: потолок — сутки', () => {
  assert.equal(parseRetryAfter('999999'), 24 * 60 * 60);
});

test('humanRetryDelay: секунды с русским склонением', () => {
  assert.equal(humanRetryDelay(1), 'через 1 секунду');
  assert.equal(humanRetryDelay(3), 'через 3 секунды');
  assert.equal(humanRetryDelay(20), 'через 20 секунд');
  assert.equal(humanRetryDelay(59), 'через 59 секунд');
});

test('humanRetryDelay: минуты и часы', () => {
  assert.equal(humanRetryDelay(60), 'через 1 минуту');
  assert.equal(humanRetryDelay(120), 'через 2 минуты');
  assert.equal(humanRetryDelay(300), 'через 5 минут');
  assert.equal(humanRetryDelay(3600), 'через 1 час');
  assert.equal(humanRetryDelay(3600 + 300), 'через 1 час 5 минут');
  assert.equal(humanRetryDelay(2 * 3600), 'через 2 часа');
  assert.equal(humanRetryDelay(5 * 3600), 'через 5 часов');
});

test('humanRetryDelay: дробь и ноль округляются вверх до секунды', () => {
  assert.equal(humanRetryDelay(0.2), 'через 1 секунду');
  assert.equal(humanRetryDelay(90.9), 'через 1 минуту');
});
