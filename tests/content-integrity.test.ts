import test from "node:test";
import assert from "node:assert/strict";
import { articleDateIso, articleMonthIso } from "../src/lib/article-date";
import { articles, jobs, internships, plans, reviews } from "../src/lib/data";

/**
 * Даты статей и целостность контента.
 *
 * Регрессия: в разметке schema.org у всех статей стояло
 * `datePublished: new Date().toISOString()`, вычисленное на уровне модуля.
 * То есть каждая статья объявлялась опубликованной в момент сборки, а
 * поисковики ориентируются именно на это поле при индексации и оценке
 * свежести. Теперь дата берётся реальная, и она должна разбираться из
 * русскоязычного формата, который используется в data.ts.
 */

test("дата статьи разбирается в ISO", () => {
  assert.equal(articleDateIso("12 сентября 2026"), "2026-09-12");
  assert.equal(articleDateIso("1 января 2026"), "2026-01-01");
  assert.equal(articleDateIso("31 декабря 2025"), "2025-12-31");
});

test("сокращённый месяц тоже распознаётся", () => {
  assert.equal(articleDateIso("3 сен 2026"), "2026-09-03");
  assert.equal(articleDateIso("3 сент. 2026"), "2026-09-03");
});

test("неизвестный формат даёт null, а не выдуманную дату", () => {
  assert.equal(articleDateIso("когда-то"), null);
  assert.equal(articleDateIso("2026-09-12"), null, "ISO не в этом формате не ожидается, но не должно ломаться");
  assert.equal(articleDateIso(""), null);
  assert.equal(articleDateIso("32 сентября 2026"), null, "несуществующий день отвергается");
  assert.equal(articleDateIso("12 бартваря 2026"), null, "неизвестный месяц отвергается");
});

test("месяц без дня разбирается для группировки", () => {
  assert.equal(articleMonthIso("12 сентября 2026"), "2026-09");
  assert.equal(articleMonthIso("сентябрь 2026"), "2026-09");
  assert.equal(articleMonthIso("мусор"), null);
});

test("все даты статей реально разбираются", () => {
  for (const article of articles) {
    const iso = articleDateIso(article.date);
    assert.ok(
      iso,
      `дата «${article.date}» статьи ${article.slug} не распознана — в разметке не будет datetime`,
    );
    assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("slug'ы статей уникальны", () => {
  const slugs = articles.map((a) => a.slug);
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  assert.deepEqual([...new Set(dupes)], [], "дубли slug'ов ломают generateStaticParams");
});

/**
 * Стажировки и вакансии делят пространство slug'ов: у вакансий slug —
 * первичный ключ таблицы vacancies. Сейчас коллизия безвредна (на
 * /internships slug используется только как ключ React), но при появлении
 * /internships/[slug] одинаковые пути схлопнулись бы.
 */
test("slug'ы вакансий и стажировок не пересекаются", () => {
  const jobSlugs = new Set(jobs.map((j) => j.slug));
  for (const int of internships) {
    assert.ok(
      !jobSlugs.has(int.slug),
      `стажировка «${int.slug}» совпадает со slug'ом вакансии — пути схлопнутся`,
    );
  }
});

test("все slug'ы — kebab-case латиницей", () => {
  for (const item of [...articles, ...jobs, ...internships]) {
    assert.match(item.slug, /^[a-z0-9-]+$/, `некорректный slug: ${item.slug}`);
  }
});

test("цены тарифов заданы для всех периодов и возрастают", () => {
  for (const plan of plans) {
    const values = [plan.prices[7], plan.prices[14], plan.prices[30]];
    assert.ok(values.every((v) => Number.isFinite(v) && v > 0), `цены тарифа ${plan.name} некорректны`);
    assert.ok(values[1] >= values[0] && values[2] >= values[1], `цены ${plan.name} не монотонны`);
  }
});

test("рейтинги отзывов в допустимом диапазоне", () => {
  for (const review of reviews) {
    assert.ok(
      review.rating >= 1 && review.rating <= 5,
      `рейтинг ${review.rating} вне диапазона 1..5`,
    );
  }
});

test("у вакансий заполнены обязательные поля", () => {
  for (const job of jobs) {
    assert.ok(job.title.trim(), `вакансия ${job.slug}: пустое название`);
    assert.ok(job.company.trim(), `вакансия ${job.slug}: пустая компания`);
    assert.ok(job.about.trim(), `вакансия ${job.slug}: пустое описание`);
    assert.ok(job.requirements.length > 0, `вакансия ${job.slug}: нет требований`);
  }
});
