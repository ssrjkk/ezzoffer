import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities, htmlToText } from '../src/lib/text-decode';

/**
 * Распаковка разметки из внешних источников.
 *
 * Главный регресс здесь — двойная распаковка. Старые версии очистителей
 * заменяли `&amp;` раньше, чем `&lt;`, и `&amp;lt;script&amp;gt;` (литерал,
 * который кто-то вставил в описание) превращался в `&lt;script&gt;`, а затем в
 * `<script>`. Один проход по строке это исключает.
 */

test('двойная ссылка на сущность остаётся литералом, а не тегом', () => {
  assert.equal(decodeEntities('&amp;lt;script&amp;gt;'), '&lt;script&gt;');
  assert.equal(htmlToText('<p>&amp;lt;script&amp;gt;</p>'), '&lt;script&gt;');
});

test('разметка, закодированная сущностями, вырезается, а не остаётся тегом', () => {
  assert.equal(htmlToText('&lt;script&gt;alert(1)&lt;/script&gt;'), 'alert(1)');
  assert.ok(!htmlToText('<div>&lt;b&gt;жирный&lt;/b&gt;</div>').includes('<b>'));
});

test('настоящие теги и именованные сущности дают читаемый текст', () => {
  assert.equal(
    htmlToText('<p>Привет&nbsp;&laquo;мир&raquo;</p><ul><li>дело</li></ul>'),
    'Привет «мир» дело',
  );
});

test('незакрытый хвост тега не остаётся в тексте', () => {
  assert.equal(htmlToText('нужен разработчик <div'), 'нужен разработчик');
});

test('числовые сущности считаются один раз и в пределах шкалы Unicode', () => {
  assert.equal(decodeEntities('&#8212;'), '—');
  assert.equal(decodeEntities('&#x2014;'), '—');
  assert.equal(decodeEntities('&#1114112;'), '&#1114112;', 'код за пределами шкалы не должен молча портиться');
  assert.equal(decodeEntities('&#0;'), '&#0;', 'нулевой код — не символ');
  assert.equal(decodeEntities('&unknownentity;'), '&unknownentity;', 'незнакомая сущность остаётся как есть');
});

test('htmlToText схлопывает разметку в одну читаемую строку', () => {
  assert.equal(htmlToText('<p>первый</p><p>второй</p>'), 'первый второй');
});
