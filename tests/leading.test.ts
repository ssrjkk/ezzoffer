import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Интерлиньяж антиквы.
 *
 * Заголовки набраны Playfair Display, и у него реальные глифы занимают
 * 0.97em: actualBoundingBoxAscent 0.79 плюс descent 0.18 на строке с
 * кириллицей «бдщщырц». При line-height 1 строка ровно 1em, то есть
 * между строками не остаётся НИЧЕГО и нижние выносные садятся на верхние
 * выносные предыдущей строки.
 *
 * Это не опечатка и не вкус: замер через Range в браузере давал наложение
 * на всех заголовках от 48px и выше — главный заголовок на главной
 * показывал 3 строки, и все три перекрывались. Причём на латинице
 * (буквы без глифов с глубоким выносом) дефект был бы почти незаметен —
 * проявился он именно на кириллице.
 *
 * Проверка идёт по исходнику, потому что пересечение строк можно увидеть
 * только в браузере со сдвигом ширины, а оно зависит от переносов.
 * Тест ловит сам корень: утилиту display и явные leading-* на антикве.
 */

/** Глифы Playfair занимают столько em — измерено canvas-метриками. */
const PLAYFAIR_INK_EM = 0.97;

/** Минимальный зазор между строками в em: 0.15em ≈ 3.6px на 24px и 10.8px на 72px. */
const MIN_GAP_EM = 0.15;

const MIN_LINE_HEIGHT = PLAYFAIR_INK_EM + MIN_GAP_EM; // 1.12

function sourceFiles(): string[] {
  return execSync("git ls-files src", { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((f) => /\.tsx$/.test(f));
}

/** Разбирает line-height из класса вида leading-tight / leading-[1.05]. */
function lineHeightOf(cls: string): number | null {
  if (/\bleading-none\b/.test(cls)) return 1;
  if (/\bleading-tight\b/.test(cls)) return 1;
  if (/\bleading-snug\b/.test(cls)) return 1.375;
  if (/\bleading-normal\b/.test(cls)) return null; // ~1.5, не задаём явно
  if (/\bleading-relaxed\b/.test(cls)) return 1.625;
  const m = cls.match(/leading-\[([\d.]+)\]/);
  return m ? Number(m[1]) : null;
}

test("утилита display не сжимает строки", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const block = css.match(/@utility display \{([^}]*)\}/);
  assert.ok(block, "@utility display не найдена");

  const lh = block[1]!.match(/line-height:\s*([\d.]+)/);
  assert.ok(lh, "в @utility display не задан line-height");

  const value = Number(lh[1]);
  assert.ok(
    value >= MIN_LINE_HEIGHT,
    `у display line-height ${value}: глифы Playfair занимают ${PLAYFAIR_INK_EM}em, ` +
      `порог ${MIN_LINE_HEIGHT} (${PLAYFAIR_INK_EM} глифы + ${MIN_GAP_EM} воздуха) — строки будут накладываться`,
  );
});

test("на антикве нет line-height ниже порога", () => {
  const offenders: string[] = [];

  for (const file of sourceFiles()) {
    const source = readFileSync(file, "utf8");

    // Антиква в этом проекте всегда задаётся либо утилитой display,
    // либо парой font-serif в том же className.
    for (const m of source.matchAll(/className="([^"]*)"/g)) {
      const cls = m[1]!;
      const usesSerif = /\bfont-serif\b/.test(cls) || /\bdisplay\b/.test(cls);
      if (!usesSerif) continue;

      const lh = lineHeightOf(cls);
      if (lh === null) continue;

      // leading-none законен на одиночной инициале: там одна строка,
      // наложения быть не может. Таких мест ровно одно, и оно помечено.
      if (lh === 1 && /\bleading-none\b/.test(cls)) continue;

      if (lh < MIN_LINE_HEIGHT) {
        const line = source.slice(0, m.index).split("\n").length;
        offenders.push(`${file}:${line}  line-height ${lh} (порог ${MIN_LINE_HEIGHT})  «${cls.slice(0, 64)}»`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `строки антиквы накладываются — глифы Playfair занимают ${PLAYFAIR_INK_EM}em:\n${offenders.join("\n")}`,
  );
});