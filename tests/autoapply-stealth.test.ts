import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Прогрев нового отправителя сквозным прогоном.
 *
 * Юнит-тесты формулы — в stealth-profile.test.ts. Здесь проверяется
 * проводка: runAutoApply режет суточный лимит пользователя без истории
 * отправок, а без флага прогрева те же фикстуры уходят полностью.
 */

type Database = ReturnType<typeof import('../src/lib/db').createDatabase>;

let db: Database;
let autoapply: typeof import('../src/lib/autoapply');
let resetCatalogCache: () => void;
let resetPacing: () => void;

const FAST_PACING = {
  pacing: { minDelayMs: 0, maxDelayMs: 0, jitterMinutes: 0 },
  now: () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d.getTime();
  },
};

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  process.env.AUTOAPPLY_WORK_START = '0';
  process.env.AUTOAPPLY_WORK_END = '24';
  db = (await import('../src/lib/db')).db;
  autoapply = await import('../src/lib/autoapply');
  resetCatalogCache = (await import('../src/lib/vacancies')).resetCatalogCache;
  resetPacing = (await import('../src/lib/autoapply')).resetPacing;

  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/token')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'user-token', expires_in: 3600 }),
      } as unknown as Response;
    }
    if (u.includes('/negotiations')) {
      return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ items: [] }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;
});

beforeEach(() => {
  db.exec(
    'DELETE FROM apply_events; DELETE FROM auth_attempts; DELETE FROM bookmarks; DELETE FROM applications; DELETE FROM searches; DELETE FROM resumes; DELETE FROM users; DELETE FROM vacancies;',
  );
  resetCatalogCache();
  resetPacing();
  delete process.env.AUTOAPPLY_WARMUP_DAYS;
  delete process.env.AUTOAPPLY_WEEKEND_FACTOR;
  delete process.env.AUTOAPPLY_LONG_BREAK_CHANCE;
});

function seedUser(plan = 'start'): void {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, plan, plan_expires_at, created_at, hh_token,
       hh_resume_id, telegram_chat_id, autoapply_paused, autoapply_blocked_until, autoapply_block_reason, mode)
     VALUES (1, 'u@example.test', 'h', ?, ?, ?, 'user-token', 'res123', '777', 0, 0, '', 'live')`,
  ).run(plan, Date.now() + 100_000, Date.now());
  db.prepare(
    `INSERT INTO resumes (user_id, title, content, hh_id, created_at, updated_at)
     VALUES (1, 'Frontend', 'React', 'hh-front', ?, ?)`,
  ).run(Date.now(), Date.now());
  db.prepare(
    "INSERT INTO searches (user_id, title, keywords, active, started_at, created_at) VALUES (1, 's', 'react', 1, ?, ?)",
  ).run(Date.now(), Date.now());
}

function seedVacancy(i: number): void {
  const slug = `hh-warm-${i}`;
  db.prepare(
    `INSERT INTO vacancies (slug, source, source_id, title, company, salary, level, format, city,
       posted, published_at, category, about, requirements, fetched_at)
     VALUES (?, 'hh', ?, ?, ?, '200000', 'Middle', 'Удалённо', 'Москва',
       'сегодня', ?, 'Разработка', 'Требуются: React', '["React"]', ?)`,
  ).run(slug, slug, `React-разработчик ${i}`, `Компания ${i}`, Date.now(), Date.now());
}

function sentCount(): number {
  return (
    db.prepare('SELECT COUNT(*) AS c FROM applications WHERE user_id = 1').get() as { c: number }
  ).c;
}

test('без прогрева уходит всё (start: 10 из 10)', async () => {
  seedUser('start');
  for (let i = 0; i < 10; i++) seedVacancy(i);
  await autoapply.runAutoApply(FAST_PACING);
  assert.equal(sentCount(), 10, 'без флага прогрева резать нечего');
});

test('прогрев режет первый день: start 50/день → 7', async () => {
  seedUser('start');
  for (let i = 0; i < 10; i++) seedVacancy(i);
  process.env.AUTOAPPLY_WARMUP_DAYS = '7';
  try {
    await autoapply.runAutoApply(FAST_PACING);
  } finally {
    delete process.env.AUTOAPPLY_WARMUP_DAYS;
  }
  // Первый день: floor(50 * 1/7) = 7.
  assert.equal(sentCount(), 7, 'прогрев не сработал');
});

test('прогрев не трогает отправителя со стажем', async () => {
  seedUser('start');
  for (let i = 0; i < 10; i++) seedVacancy(i);
  // История старше недели: полный объём сразу.
  db.prepare('INSERT INTO applications (user_id, job_slug, status, sent_at) VALUES (1, ?, ?, ?)').run(
    'hh-old',
    'sent',
    Date.now() - 30 * 86_400_000,
  );
  process.env.AUTOAPPLY_WARMUP_DAYS = '7';
  try {
    await autoapply.runAutoApply(FAST_PACING);
  } finally {
    delete process.env.AUTOAPPLY_WARMUP_DAYS;
  }
  assert.equal(sentCount(), 11, 'зрелый отправитель урезан прогревом');
});
