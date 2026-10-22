import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, rateLimitKey } from '../src/lib/rate-limit';

function makeClock() {
  let now = 0;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test('rateLimit разрешает запросы в пределах лимита', () => {
  const clock = makeClock();
  const state = { buckets: new Map(), now: clock.now };

  for (let i = 0; i < 3; i++) {
    assert.equal(
      rateLimit('k', { windowMs: 1000, max: 3 }, state).allowed,
      true,
      `попытка ${i + 1}`,
    );
  }
  const blocked = rateLimit('k', { windowMs: 1000, max: 3 }, state);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
});

test('rateLimit освобождает ключ после окна', () => {
  const clock = makeClock();
  const state = { buckets: new Map(), now: clock.now };

  for (let i = 0; i < 2; i++) {
    rateLimit('k', { windowMs: 1000, max: 2 }, state);
  }
  assert.equal(rateLimit('k', { windowMs: 1000, max: 2 }, state).allowed, false);
  clock.advance(1001);
  assert.equal(rateLimit('k', { windowMs: 1000, max: 2 }, state).allowed, true);
});

test('разные ключи не блокируют друг друга', () => {
  const clock = makeClock();
  const state = { buckets: new Map(), now: clock.now };

  for (let i = 0; i < 2; i++) {
    rateLimit('a', { windowMs: 1000, max: 1 }, state);
  }
  assert.equal(rateLimit('b', { windowMs: 1000, max: 1 }, state).allowed, true);
});

test('модульный дефолт держит состояние между вызовами (regression: default state)', () => {
  // Раньше дефолтный state создавался в параметре на каждый вызов — лимитер не работал.
  assert.equal(rateLimit('shared', { windowMs: 60000, max: 2 }).allowed, true);
  assert.equal(rateLimit('shared', { windowMs: 60000, max: 2 }).allowed, true);
  const blocked = rateLimit('shared', { windowMs: 60000, max: 2 });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

/**
 * Регрессия (исправлена иначе): proxy.ts использовал `clientIp(request) ??
 * "unknown"`, а clientIp() возвращает null без TRUST_PROXY. Все пользователи
 * делили один бакет с потолком 60/мин — сайт отдавал 429 всем подряд.
 *
 * Промежуточное «лечение» (ключ из хеша cookie) оказалось хуже болезни:
 * значение cookie приходит от клиента, и подмена давала новый бакет на каждый
 * запрос — лимит обходился полностью. Поэтому без доверенного IP все делят
 * общий бакет anon с высоким потолком. Разные сессии БЕЗ прокси один бакет
 * делят — это осознанно, а не баг.
 */
test('без TRUST_PROXY все запросы делят общий бакет anon (cookie не доверяем)', () => {
  delete process.env.TRUST_PROXY;

  const a = rateLimitKey(
    new Request('https://d.ru/api/x', { headers: { cookie: 'ez_session=aaa' } }),
    'api',
  );
  const b = rateLimitKey(
    new Request('https://d.ru/api/x', { headers: { cookie: 'ez_session=bbb' } }),
    'api',
  );
  assert.equal(a, 'api:anon');
  assert.equal(b, 'api:anon', 'подмена cookie не должна давать новый бакет');
});

test('подмена cookie не обходит лимит: бакет общий', () => {
  delete process.env.TRUST_PROXY;
  const r1 = new Request('https://d.ru/api/x', { headers: { cookie: 'ez_session=token123' } });
  const r2 = new Request('https://d.ru/api/y', {
    headers: { cookie: 'other=1; ez_session=token123' },
  });
  assert.equal(rateLimitKey(r1, 'api'), rateLimitKey(r2, 'api'));
});

test('аноним без IP и сессии попадает в отдельный бакет anon', () => {
  delete process.env.TRUST_PROXY;
  const key = rateLimitKey(new Request('https://d.ru/api/x'), 'api');
  assert.equal(key, 'api:anon');
});

test('с TRUST_PROXY ключ строится по IP', () => {
  process.env.TRUST_PROXY = '1';
  try {
    const key = rateLimitKey(
      new Request('https://d.ru/api/x', {
        headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
      }),
      'api',
    );
    assert.equal(key, 'api:ip:203.0.113.7');
  } finally {
    delete process.env.TRUST_PROXY;
  }
});
