import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * parsePublishedAt — машинный возраст вакансии.
 *
 * От этой функции зависит, стоит ли тратить дневной слот на отклик: неразобранная
 * дата — null (осторожное поведение), разобранная — точная метка. Проверяются
 * форматы, которые реально приходят от площадок, включая русские: их Date.parse
 * либо не понимает («28 сентября»), либо понимает НЕВЕРНО («12.09.2026» →
 * 9 декабря по американскому порядку).
 */
import { parsePublishedAt, relativePosted } from '../src/lib/vacancies/published';

test('ISO-строка разбирается как раньше', () => {
  const ms = parsePublishedAt('2020-06-15T10:00:00Z');
  assert.equal(ms, Date.parse('2020-06-15T10:00:00Z'));
});

test('epoch в секундах и миллисекундах', () => {
  assert.equal(parsePublishedAt(1_700_000_000), 1_700_000_000_000);
  assert.equal(parsePublishedAt(1_700_000_000_000), 1_700_000_000_000);
  // Строковая epoch (RSS).
  assert.equal(parsePublishedAt('1700000000'), 1_700_000_000_000);
});

test('«28 сентября 2026» — русская дата с годом', () => {
  assert.equal(parsePublishedAt('28 сентября 2026'), Date.UTC(2026, 8, 28));
  assert.equal(parsePublishedAt('3 сен 2020'), Date.UTC(2020, 8, 3));
});

test('«28 сентября» без года — выводится прошедший год (regression GeekJob)', () => {
  const now = new Date();
  // День 1-го числа не бывает будущим, поэтому дата валидна при любом дне запуска.
  const expectedYear = 5 > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
  assert.equal(parsePublishedAt('1 июня'), Date.UTC(expectedYear, 5, 1));
  // Январь никогда не в будущем → всегда текущий год.
  assert.equal(parsePublishedAt('1 января'), Date.UTC(new Date().getFullYear(), 0, 1));
});

test('«03.04.2026» — день.месяц.год, а не американский month.day (regression)', () => {
  // Date.parse('12.09.2020') в Node даёт 9 декабря; наш разбор обязан дать
  // 12 сентября. Год взят прошлый, чтобы тест не зависел от дня запуска.
  assert.equal(parsePublishedAt('12.09.2020'), Date.UTC(2020, 8, 12));
  assert.equal(parsePublishedAt('03.04.2020'), Date.UTC(2020, 3, 3));
});

test('будущая дата — мусор, а не дата', () => {
  assert.equal(parsePublishedAt('1 января 2999'), null);
});

test('неразобранный текст — null, а не «сейчас»', () => {
  assert.equal(parsePublishedAt('вчера'), null);
  assert.equal(parsePublishedAt('недавно'), null);
  assert.equal(parsePublishedAt(''), null);
  assert.equal(parsePublishedAt(null), null);
  assert.equal(parsePublishedAt(undefined), null);
  assert.equal(parsePublishedAt(0), null);
  assert.equal(parsePublishedAt(-5), null);
});

test('relativePosted согласован с разбором русских дат', () => {
  // Раньше «28 сентября» давало published_at: null и текст «дата неизвестна»;
  // теперь возраст известен.
  assert.notEqual(relativePosted('1 июня'), 'дата неизвестна');
});
