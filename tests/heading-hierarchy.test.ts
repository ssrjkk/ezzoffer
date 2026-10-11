import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Иерархия заголовков.
 *
 * Моноширинная прописная метка — это не заголовок. На бумажной теме ею
 * оформлены Eyebrow и подписи колонок, то есть служебные метки; крупные
 * заголовки набраны антиквой.
 *
 * Ошибка проходила незаметно: два заголовка («Читайте также» в статье и
 * «Ключевые слова» в образце резюме) оказались набраны моноширинной
 * прописной строкой — визуально они выглядели как подписи к блокам, и в
 * оглавлении страницы выглядели как подписи тоже.
 *
 * Проверка по исходнику, а не по DOM: в DOM эти стили считались бы
 * одинаковыми, различие только в теге.
 */
function sourceFiles(): string[] {
  return execSync("git ls-files src", { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((f) => /\.(tsx|ts)$/.test(f));
}

test("служебная метка не надета на заголовок", () => {
  const offenders: string[] = [];

  for (const file of sourceFiles()) {
    const content = readFileSync(file, "utf8");

    for (const m of content.matchAll(/<(h[1-6])\b[^>]*className="([^"]*)"[^>]*>/g)) {
      const [, tag, cls] = m;
      // Метка: моноширинный + прописные + трекинг.
      const looksLikeLabel =
        /\bfont-mono\b/.test(cls!) && /\buppercase\b/.test(cls!) && /tracking-/.test(cls!);
      if (looksLikeLabel) {
        const line = content.slice(0, m.index).split("\n").length;
        offenders.push(`${file}:${line}  <${tag}> «${cls!.slice(0, 60)}»`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `метка набрана как заголовок — в структуре документа она станет пунктом оглавления:\n${offenders.join("\n")}`,
  );
});

test("заголовки разделов набраны антиквой, а не гротеском", () => {
  /*
   * Гротеск (шрифт по умолчанию в старой теме) на заголовке — это тот
   * самый вид «приложения из 2021 года». Проверяем по исходнику: все
   * уровни h1–h4 должны содержать font-serif либо display-утилиту.
   *
   * Исключений нет: там, где нужен интерфейсный гротеск, стоит не
   * заголовок. Если обоснованное исключение появится, пусть оно будет
   * явным списком здесь, а не молчаливым промахом.
   */
  const offenders: string[] = [];

  for (const file of sourceFiles()) {
    const content = readFileSync(file, "utf8");
    for (const m of content.matchAll(/<(h[1-4])\b[^>]*className="([^"]*)"[^>]*>/g)) {
      const cls = m[2]!;
      if (!/\bfont-serif\b/.test(cls) && !/\bdisplay\b/.test(cls)) {
        const line = content.slice(0, m.index).split("\n").length;
        offenders.push(`${file}:${line}  <${m[1]}> «${cls.slice(0, 70)}»`);
      }
    }
  }

  assert.deepEqual(offenders, [], `заголовок без антиквы:\n${offenders.join("\n")}`);
});