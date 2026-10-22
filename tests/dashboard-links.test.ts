import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ссылки кабинета ведут в существующие маршруты.
 *
 * Регрессия: два действия «что делать дальше» (pipeline.ts) вели на
 * /dashboard/searches — страницы с таким адресом нет, и человек получал 404
 * ровно в тот момент, когда решил действовать. Типы и линтер такое не ловят:
 * href — обычная строка.
 *
 * Проверка статическая (без сервера): собирает все href="/dashboard/…"
 * из исходников кабинета и сверяет с файлами маршрутов на диске.
 */

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) out.push(full);
    }
  };
  walk(join(process.cwd(), 'src'));
  return out;
}

function routeExists(href: string): boolean {
  const [path] = href.split(/[?#]/);
  if (!path || !path.startsWith('/dashboard')) return true;
  const parts = path.split('/').filter(Boolean);
  const root = join(process.cwd(), 'src', 'app');
  // Точное совпадение: /dashboard/jobs → dashboard/jobs/page.tsx
  if (existsSync(join(root, ...parts, 'page.tsx'))) return true;
  // Динамический сегмент: /dashboard/jobs/x → dashboard/jobs/[slug]/page.tsx
  for (let i = parts.length; i >= 2; i--) {
    if (existsSync(join(root, ...parts.slice(0, i - 1), '[slug]', 'page.tsx'))) return true;
  }
  return false;
}

test('все href кабинета указывают на существующие страницы', () => {
  const broken: string[] = [];
  for (const file of sourceFiles()) {
    const raw = readFileSync(file, 'utf8');
    const text = raw
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    for (const m of text.matchAll(/href:\s*['"`](\/dashboard[^'"`]*?)['"`]/g)) {
      if (!routeExists(m[1])) broken.push(`${file}: ${m[1]}`);
    }
    for (const m of text.matchAll(/href=\{?["'`](\/dashboard[^"'`]*?)["'`]\}?/g)) {
      if (!routeExists(m[1])) broken.push(`${file}: ${m[1]}`);
    }
  }
  assert.deepEqual(
    [...new Set(broken)],
    [],
    `ссылки ведут на несуществующие страницы:\n${[...new Set(broken)].join('\n')}`,
  );
});
