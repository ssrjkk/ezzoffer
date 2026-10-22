#!/usr/bin/env node
/**
 * Проверка всех ссылок локального стенда.
 *
 * Берёт /sitemap.xml, обходит каждую страницу, собирает href и проверяет
 * статусы. Внешние ссылки не трогаем (чужие серверы, ретина, лимиты) — только
 * свои: битая внутренняя ссылка это всегда наш баг. Выход 1, если есть
 * провалы.
 *
 * Использование: BASE=http://localhost:3000 node scripts/check-links.mjs
 */

const BASE = (process.env.BASE ?? 'http://localhost:3000').replace(/\/+$/, '');

async function get(path) {
  const res = await fetch(BASE + path, { redirect: 'manual' });
  const ct = res.headers.get('content-type') ?? '';
  const text = ct.includes('html') || ct.includes('xml') ? await res.text() : '';
  return { status: res.status, text };
}

const failures = [];
const seen = new Set();

async function checkPage(path) {
  if (seen.has(path)) return;
  seen.add(path);
  let page;
  try {
    page = await get(path);
  } catch (err) {
    failures.push(`${path} — fetch: ${err.message}`);
    return;
  }
  if (page.status >= 400) {
    failures.push(`${path} — HTTP ${page.status}`);
    return;
  }
  const hrefs = [...page.text.matchAll(/href="([^"#]+)"/g)].map((m) => m[1]);
  for (const href of new Set(hrefs)) {
    if (!href.startsWith('/')) continue;
    if (href.startsWith('/api/')) continue;
    try {
      const r = await fetch(BASE + href, { method: 'HEAD', redirect: 'manual' });
      if (r.status >= 400) failures.push(`${path} → ${href} — HTTP ${r.status}`);
    } catch (err) {
      failures.push(`${path} → ${href} — fetch: ${err.message}`);
    }
  }
}

const sitemap = await get('/sitemap.xml');
const urls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
console.log(`страниц в sitemap: ${urls.length}`);
for (const u of urls) await checkPage(u);
await checkPage('/dashboard/settings');
await checkPage('/dashboard/jobs');

if (failures.length > 0) {
  console.log('БИТЫЕ ССЫЛКИ:');
  for (const f of failures) console.log(' ', f);
  process.exit(1);
}
console.log(`OK: проверено страниц ${seen.size}, битых ссылок нет`);
