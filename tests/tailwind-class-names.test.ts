import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Классы Tailwind, которых не существует.
 *
 * Регрессия: массовая замена полупрозрачного белого испортила девять
 * классов — «bg-surface-203]». Tailwind такое имя не знает и CSS для него
 * не генерирует, поэтому карточки в кабинете молча остались без фона.
 *
 * Ни TypeScript, ни ESLint, ни сборка на это не смотрят: строка className
 * остаётся валидной. Ловится только здесь — по форме имени.
 *
 * Приём сознательно грубый: любое «<утилита>-<цвет>/<число>]» означает,
 * что регулярка съела часть класса. Такой шаблон в className не встречается
 * никогда намеренно.
 */

function sourceFiles(): string[] {
  return execSync("git ls-files src", { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((f) => /\.(tsx|ts)$/.test(f));
}

test("в className нет классов с оборванной альфой", () => {
  const offenders: string[] = [];

  for (const file of sourceFiles()) {
    const content = readFileSync(file, "utf8");
    for (const m of content.matchAll(
      /\b(?:bg|text|border|ring|shadow|from|via|to|divide|fill|stroke|outline|accent|caret)-[a-z0-9-]*\d+\]/g,
    )) {
      offenders.push(`${file}: ${m[0]}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Tailwind не знает таких имён — CSS не генерируется, элемент останется без оформления:\n${offenders.join("\n")}`,
  );
});

test("альфа-скобочная запись не поехала", () => {
  /*
   * Ловушка того же бага в другой форме. Легитимные записи:
   *   bg-accent/[0.06]  — альфа в квадратных скобках, после «]» ничего;
   *   bg-[#229ED9]     — произвольное значение.
   * Испорченная выглядит так, что «]» идёт сразу за цифрами без ведущего
   * слэша: bg-surface-203].
   */
  const offenders: string[] = [];

  for (const file of sourceFiles()) {
    const content = readFileSync(file, "utf8");
    for (const m of content.matchAll(
      /(?:^|[\s"'(,])((?:bg|text|border|ring|from|via|to)-[a-z0-9-]*\d+\])/g,
    )) {
      offenders.push(`${file}: ${m[1]}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `похоже на испорченный класс (цифры сразу перед «]»):\n${offenders.join("\n")}`,
  );
});

/**
 * Невидимый текст: белым по светлому.
 *
 * Регрессия перехода на бумагу: в stats-panel и plan-banner остался
 * text-white на белых панелях — конвертация поменяла фон, а цвет текста
 * остался от тёмной темы. Показатели в панели статистики были буквально
 * не видны.
 *
 * Проверка эвристическая: смотрим блок вокруг строки и ищем тёмную
 * подложку. Если её нет — белый текст на светлом фоне.
 */
test("белый текст только на тёмной подложке", () => {
  const DARK_BG = /bg-ink|bg-black|bg-accent\b|bg-violet|bg-danger\b|bg-paper|#229ED9|#2AABEE/;
  const offenders: string[] = [];

  for (const file of sourceFiles()) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!/text-white(?![\w/-])/.test(line)) return;
      const around = lines.slice(Math.max(0, i - 6), i + 7).join("\n");
      if (DARK_BG.test(around)) return;
      offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 80)}`);
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `белый текст без тёмной подложки — невидим:\n${offenders.join("\n")}`,
  );
});