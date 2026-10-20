#!/usr/bin/env node
/**
 * Обновление снимка каталога для детерминированных тестов.
 *
 * Файл один: tests/fixtures/catalog-snapshot.json — вакансии со всех площадок,
 * на них проверяются инварианты (tests/catalog-invariants.test.ts).
 *
 * Снимки — те же данные, что тесты видят в живых фидах, но зафиксированные:
 * набор не зависит от того, что площадки выложили сегодня, и сборка не может
 * упасть из-за чужой вакансии.
 *
 * Запускать осознанно: после изменения правил классификации, чтобы зафиксировать
 * новый ожидаемый набор, или когда ночной прогон нашёл в живых данных нарушение,
 * которого нет в снимке. Перед коммитом смотреть diff — снимок хранит заголовки и
 * описания вакансий с внешних площадок, и их изменение видно в нём целиком.
 *
 * Поля намеренно те же, что читает тест; about урезан до 600 символов — правила
 * классификации работают по началу описания, а полный текст раздул бы файл втрое.
 */
process.env.EZOFFER_SILENT = '1';
process.env.EZOFFER_DB_PATH = ':memory:';

import { writeFileSync } from 'node:fs';

const { db } = await import('../src/lib/db');
const { refreshProviders } = await import('../src/lib/vacancies');

await refreshProviders({ limit: 100 });

type Row = {
  slug: string;
  source: string;
  title: string;
  category: string;
  about: string | null;
  level: string;
  employment: string | null;
};

const rows = db
  .prepare(
    'SELECT slug, source, title, category, about, level, employment FROM vacancies ORDER BY source, slug',
  )
  .all() as Row[];

for (const r of rows) {
  if (typeof r.about === 'string' && r.about.length > 600) r.about = r.about.slice(0, 600);
}

writeFileSync(
  new URL('../tests/fixtures/catalog-snapshot.json', import.meta.url),
  JSON.stringify(rows, null, 1) + '\n',
);

console.log(`снимок каталога обновлён: ${rows.length} строк`);
