import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseParamId,
  isUniqueViolation,
  toPositiveNumber,
  validateSalaryRange,
} from '../src/lib/validate';

test('parseParamId принимает целые положительные id', () => {
  assert.equal(parseParamId('12'), 12);
  assert.equal(parseParamId('7'), 7);
});

test('parseParamId отклоняет мусор', () => {
  assert.equal(parseParamId(undefined), null);
  assert.equal(parseParamId(''), null);
  assert.equal(parseParamId('abc'), null);
  assert.equal(parseParamId('1.5'), null);
  assert.equal(parseParamId('-3'), null);
  assert.equal(parseParamId('0'), null);
});

test('isUniqueViolation опознаёт SQLITE_CONSTRAINT_UNIQUE', () => {
  assert.equal(isUniqueViolation(new Error('boo')), false);
  assert.equal(isUniqueViolation({ code: 'SQLITE_CONSTRAINT_UNIQUE' }), true);
  assert.equal(isUniqueViolation(null), false);
});

test('isUniqueViolation принимает PRIMARY KEY, но не FOREIGN KEY', () => {
  // Ловушка подтипов better-sqlite3: PK даёт PRIMARYKEY, а не UNIQUE.
  // Ловля только UNIQUE пропускала коллизию кодов привязки наружу как 500.
  assert.equal(
    isUniqueViolation({ code: 'SQLITE_CONSTRAINT_PRIMARYKEY' }),
    true,
    'коллизия PRIMARY KEY не опознана',
  );
  assert.equal(
    isUniqueViolation({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }),
    false,
    'чужой ключ проглочен как дубликат',
  );
  assert.equal(isUniqueViolation({ code: 'SQLITE_CONSTRAINT_NOTNULL' }), false);
});

test('toPositiveNumber парсит числа', () => {
  assert.equal(toPositiveNumber(5), 5);
  assert.equal(toPositiveNumber('5'), 5);
  assert.equal(toPositiveNumber(0), null);
  assert.equal(toPositiveNumber(-1), null);
  assert.equal(toPositiveNumber('abc'), null);
  assert.equal(toPositiveNumber(null), null);
  assert.equal(toPositiveNumber(undefined), null);
});

test('toPositiveNumber отклоняет нечисловые типы и не-десятичные записи', () => {
  // Голый Number() принимал всё это: true → 1, [100] → 100, '0x64' → 100.
  assert.equal(toPositiveNumber(true), null, 'булево принято за число');
  assert.equal(toPositiveNumber(false), null);
  assert.equal(toPositiveNumber([100]), null, 'массив принят за число');
  assert.equal(toPositiveNumber({}), null);
  assert.equal(toPositiveNumber('0x64'), null, 'hex принят за число');
  assert.equal(toPositiveNumber('1e5'), null, 'экспонента принята за число');
  assert.equal(toPositiveNumber('  '), null);
  assert.equal(toPositiveNumber(NaN), null);
  assert.equal(toPositiveNumber(Infinity), null);
});

test('toPositiveNumber принимает пробелы-разделители тысяч', () => {
  // «150 000» — естественный ввод зарплаты; раньше Number() давал NaN и
  // фильтр молча не применялся.
  assert.equal(toPositiveNumber('150 000'), 150000);
});

test('validateSalaryRange проверяет диапазон', () => {
  assert.equal(validateSalaryRange(null, null), null);
  assert.equal(validateSalaryRange(100, 200), null);
  assert.equal(
    validateSalaryRange(200, 100),
    'Минимальная зарплата не может быть больше максимальной',
  );
});
