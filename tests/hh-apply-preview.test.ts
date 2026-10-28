import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchVacancyState, hhProvider } from '../src/lib/vacancies/hh';
import type { Vacancy } from '../src/lib/vacancies/types';

/**
 * Предпросмотр вакансии перед откликом.
 *
 * Официальные клиенты сначала открывают карточку и только потом жмут
 * «Откликнуться»: POST без предшествующего GET — отличительный признак
 * скрипта. Заодно закрытая вакансия отсекается пассивным GET, а не активным
 * POST. Fail-open: сомнительный результат предпросмотра отклик не отменяет.
 */

const V: Vacancy = {
  slug: 'hh-42',
  source: 'hh',
  source_id: '42',
  title: 'Разработчик',
  company: 'ООО',
  salary: '100 000 ₽',
  salary_min: 100000,
  salary_max: null,
  level: 'Middle',
  format: 'Удалённо',
  city: 'Москва',
  posted: 'сегодня',
  category: 'Разработка',
  about: 'О вакансии',
  responsibilities: [],
  requirements: ['Требования'],
  bonus: [],
  source_url: null,
  contact_email: null,
  contact_phone: null,
  published_at: Date.now(),
};

let savedFetch: typeof globalThis.fetch;
let posts = 0;
let lastPostAuth: string | undefined;

/** Мок: GET карточки отдаёт заданное, POST всегда успешен. */
function mockHh(detail: { status: number; body: string }): void {
  posts = 0;
  lastPostAuth = undefined;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const method = String(init?.method ?? 'GET').toUpperCase();
    if (method === 'POST' && u.includes('/negotiations')) {
      posts++;
      lastPostAuth = ((init?.headers ?? {}) as Record<string, string>).Authorization;
      return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
    }
    if (u.endsWith('/vacancies/42')) {
      const ok = detail.status >= 200 && detail.status < 300;
      return { ok, status: detail.status, text: async () => detail.body } as unknown as Response;
    }
    return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
  }) as typeof globalThis.fetch;
}

beforeEach(() => {
  savedFetch = globalThis.fetch;
});

test('404 карточки — закрыта, POST не уходит', async () => {
  mockHh({ status: 404, body: 'Not Found' });
  try {
    assert.equal(await fetchVacancyState('42', 'USER-TOKEN'), 'closed');
    const res = await hhProvider.apply!(V, { resumeId: 'resume-1', accessToken: 'USER-TOKEN' });
    assert.equal(res.ok, false);
    assert.equal(res.kind, 'closed');
    assert.equal(posts, 0, 'POST ушёл в закрытую вакансию');
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test('archived:true — закрыта, POST не уходит', async () => {
  mockHh({ status: 200, body: JSON.stringify({ id: '42', archived: true }) });
  try {
    assert.equal(await fetchVacancyState('42', 'USER-TOKEN'), 'closed');
    const res = await hhProvider.apply!(V, { resumeId: 'resume-1', accessToken: 'USER-TOKEN' });
    assert.equal(res.ok, false);
    assert.equal(res.kind, 'closed');
    assert.equal(posts, 0, 'POST ушёл в архивную вакансию');
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test('открытая карточка — POST идёт с токеном пользователя', async () => {
  mockHh({ status: 200, body: JSON.stringify({ id: '42', archived: false }) });
  try {
    assert.equal(await fetchVacancyState('42', 'USER-TOKEN'), 'open');
    const res = await hhProvider.apply!(V, {
      resumeId: 'resume-1',
      accessToken: 'USER-TOKEN',
      message: 'Здравствуйте',
    });
    assert.equal(res.ok, true, `отклик не ушёл: ${res.error}`);
    assert.equal(posts, 1);
    assert.equal(lastPostAuth, 'Bearer USER-TOKEN');
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test('fail-open: сеть легла — отклик всё равно уходит', async () => {
  mockHh({ status: 0, body: '' });
  try {
    assert.equal(await fetchVacancyState('42', 'USER-TOKEN'), 'unknown');
    const res = await hhProvider.apply!(V, { resumeId: 'resume-1', accessToken: 'USER-TOKEN' });
    assert.equal(res.ok, true, 'пассивный GET отменил отклик');
    assert.equal(posts, 1);
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test('fail-open: кривой JSON и не-404 — отклик уходит', async () => {
  let total = 0;
  for (const detail of [
    { status: 200, body: 'не json' },
    { status: 403, body: 'Forbidden' },
    { status: 500, body: 'error' },
  ]) {
    mockHh(detail);
    try {
      const res = await hhProvider.apply!(V, { resumeId: 'resume-1', accessToken: 'USER-TOKEN' });
      assert.equal(res.ok, true, `отклик отменён при ${detail.status}: ${res.error}`);
      total += posts;
    } finally {
      globalThis.fetch = savedFetch;
    }
  }
  assert.equal(total, 3);
});

test('карточка читается тем же пользовательским токеном', async () => {
  let detailAuth: string | undefined;
  const saved = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/vacancies/42')) {
      detailAuth = ((init?.headers ?? {}) as Record<string, string>).Authorization;
      return { ok: true, status: 200, text: async () => '{"id":"42"}' } as unknown as Response;
    }
    return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
  }) as typeof globalThis.fetch;
  try {
    await fetchVacancyState('42', 'USER-TOKEN');
    assert.equal(detailAuth, 'Bearer USER-TOKEN', 'карточка прочитана не тем токеном');
  } finally {
    globalThis.fetch = saved;
  }
});
