import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Sitemap и robots проверяются по-настоящему: импортируются реальные модули,
 * а не их копии.
 *
 * Раньше тест переписывал ту же логику у себя (`resolveBase`, `buildUrls`) и
 * проверял собственную копию: настоящий sitemap.ts можно было сломать, и набор
 * оставался зелёным. Литеральный массив disallow, объявленный двумя строками
 * выше проверки, — тавтология того же рода.
 */

// envBaseUrl — чистая функция окружения, её проверяем напрямую.
import { envBaseUrl } from '../src/lib/env';

test('пустой SITE_URL даёт валидный абсолютный base', () => {
  assert.equal(envBaseUrl({ SITE_URL: '' }, 'SITE_URL', 'https://ezoffer.ru'), 'https://ezoffer.ru');
  assert.equal(
    envBaseUrl({ SITE_URL: '   ' }, 'SITE_URL', 'https://ezoffer.ru'),
    'https://ezoffer.ru',
  );
  assert.equal(envBaseUrl({}, 'SITE_URL', 'https://ezoffer.ru'), 'https://ezoffer.ru');
});

test('непустой SITE_URL уважается, хвостовой слэш убирается', () => {
  assert.equal(
    envBaseUrl({ SITE_URL: 'http://localhost:3000' }, 'SITE_URL', 'https://ezoffer.ru'),
    'http://localhost:3000',
  );
  assert.equal(
    envBaseUrl({ SITE_URL: 'http://localhost:3000/' }, 'SITE_URL', 'https://ezoffer.ru'),
    'http://localhost:3000',
  );
});

// Реальный sitemap: все URL абсолютные, динамика на месте.
test('настоящий sitemap: абсолютные URL и все маршруты', async () => {
  const { default: sitemap } = await import('../src/app/sitemap');
  const entries = sitemap();
  assert.ok(entries.length >= 29, `в sitemap всего ${entries.length} записей — маршруты потеряны`);
  for (const e of entries) {
    const u = new URL(e.url);
    assert.ok(
      u.protocol === 'https:' || u.protocol === 'http:',
      `${e.url} должен быть абсолютным URL, а не путём`,
    );
  }
  const paths = entries.map((e) => new URL(e.url).pathname);
  for (const p of [
    '/',
    '/reviews',
    '/about',
    '/faq',
    '/jobs',
    '/pricing',
    '/blog',
    '/internships',
    '/platform-rules',
    '/resume-examples',
  ]) {
    assert.ok(paths.includes(p), `в sitemap нет статики ${p}`);
  }
  assert.ok(paths.some((p) => p.startsWith('/jobs/')), 'в sitemap нет ни одной /jobs/[slug]');
  assert.ok(paths.some((p) => p.startsWith('/blog/')), 'в sitemap нет ни одной /blog/[slug]');
  assert.ok(
    paths.some((p) => p.startsWith('/resume-examples/')),
    'в sitemap нет ни одной /resume-examples/[slug]',
  );
});

// Реальный robots: приватные зоны закрыты.
test('настоящий robots закрывает приватные зоны', async () => {
  const { default: robots } = await import('../src/app/robots');
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
  const disallow: string[] = rules.flatMap((x) => {
    const d = (x as { disallow?: string | string[] }).disallow;
    return Array.isArray(d) ? d : d ? [d] : [];
  });
  for (const zone of ['/dashboard', '/api/', '/login', '/signup']) {
    assert.ok(
      disallow.some((d) => zone.startsWith(d) || d.startsWith(zone)),
      `robots не закрывает ${zone}: [${disallow.join(', ')}]`,
    );
  }
  assert.ok(String(r.sitemap).startsWith('https://'), 'sitemap в robots относительный');
});
