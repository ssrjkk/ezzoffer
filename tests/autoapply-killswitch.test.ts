import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Рубильники автооткликов: AUTOAPPLY_ENABLED и AUTOAPPLY_DRY_RUN.
 *
 * Без них остановить отправку можно было только гашением поисков по одному,
 * а проверить логику на живых данных без внешних эффектов — никак. ENABLED=0
 * останавливает всё, DRY_RUN=1 считает подбор, но не делает POST и не пишет
 * историю.
 */

type Database = ReturnType<typeof import('../src/lib/db').createDatabase>;
let db: Database;
let runAutoApply: (
  opts?: Parameters<typeof import('../src/lib/autoapply').runAutoApply>[0],
) => Promise<import('../src/lib/autoapply').AutoApplyRun>;
let resetPacing: () => void;
let resetCatalogCache: () => void;

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  process.env.AUTOAPPLY_WORK_START = '0';
  process.env.AUTOAPPLY_WORK_END = '24';
  delete process.env.HH_ACCESS_TOKEN;
  delete process.env.HH_CLIENT_ID;
  delete process.env.AUTOAPPLY_ENABLED;
  delete process.env.AUTOAPPLY_DRY_RUN;
  const dbMod = await import('../src/lib/db');
  db = dbMod.db;
  const aa = await import('../src/lib/autoapply');
  runAutoApply = (await import('./helpers/run-autoapply')).runAutoApply;
  resetPacing = aa.resetPacing;
  resetCatalogCache = (await import('../src/lib/vacancies')).resetCatalogCache;
});

beforeEach(() => {
  // Порядок важен: журналы и попытки ссылаются на users через FK.
  db.exec(
    'DELETE FROM apply_events; DELETE FROM auth_attempts; DELETE FROM applications; DELETE FROM letters; DELETE FROM resumes; DELETE FROM searches; DELETE FROM users; DELETE FROM vacancies; DELETE FROM send_slots;',
  );
  delete process.env.AUTOAPPLY_ENABLED;
  delete process.env.AUTOAPPLY_DRY_RUN;
  resetCatalogCache();
  resetPacing();
  db.exec("DELETE FROM meta WHERE key LIKE 'pacing:%';");
});

function seedLiveUser(): number {
  const uid = Number(
    db
      .prepare(
        `INSERT INTO users (email, password_hash, plan, plan_expires_at, created_at, hh_token, hh_resume_id, mode)
         VALUES (?, 'h', 'pro', ?, ?, 'user-token', 'res-kill', 'live')`,
      )
      .run(`kill${Math.random().toString(36).slice(2)}@example.com`, Date.now() + 100000, Date.now())
      .lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO resumes (user_id, title, content, hh_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(uid, 'DevOps', 'Опыт 5 лет. Kubernetes, Docker, CI.', 'hh-res-kill', Date.now(), Date.now());
  db.prepare(
    `INSERT INTO searches (user_id, title, keywords, active, started_at, created_at) VALUES (?, ?, ?, 1, ?, ?)`,
  ).run(uid, 's', 'kubernetes', Date.now(), Date.now());
  const now = Date.now();
  db.prepare(
    `INSERT INTO vacancies (slug, source, source_id, title, company, salary, salary_min, salary_max,
      level, format, city, posted, category, about, responsibilities, requirements, bonus,
      source_url, contact_email, contact_phone, published_at, fetched_at)
     VALUES ('hh-kill-1', 'hh', 'kill-1', 'DevOps-инженер', 'Тест', '200000', 200000, 250000,
      'Middle', 'Удалённо', 'Москва', 'сегодня', 'Разработка', 'Требуются: Kubernetes',
      '[]', ?, '[]', NULL, NULL, NULL, ?, ?)`,
  ).run(JSON.stringify(['Kubernetes']), now, now);
  resetCatalogCache();
  return uid;
}

test('AUTOAPPLY_ENABLED=0 останавливает прогон до всякой работы', async () => {
  const uid = seedLiveUser();
  process.env.AUTOAPPLY_ENABLED = '0';
  try {
    const result = await runAutoApply();
    assert.equal(result.ran, false);
    assert.match(result.reason ?? '', /выключены/);
    const count = db.prepare('SELECT COUNT(*) AS c FROM applications').get() as { c: number };
    assert.equal(count.c, 0, 'выключенный прогон записал отклики');
    void uid;
  } finally {
    delete process.env.AUTOAPPLY_ENABLED;
  }
});

test('AUTOAPPLY_DRY_RUN=1 считает подбор, но не отправляет и не пишет историю', async () => {
  seedLiveUser();
  process.env.AUTOAPPLY_DRY_RUN = '1';
  try {
    const result = await runAutoApply();
    assert.ok(result.ran, `прогон не отработал: ${result.reason}`);
    assert.ok(result.dryRuns > 0, `холостых отправок нет: ${JSON.stringify(result)}`);
    assert.equal(result.applied, 0, 'dry-run записал applied');
    const count = db.prepare('SELECT COUNT(*) AS c FROM applications').get() as { c: number };
    assert.equal(count.c, 0, 'dry-run пишет историю — это фиктивные отклики');
  } finally {
    delete process.env.AUTOAPPLY_DRY_RUN;
  }
});

test('без флагов поведение прежнее: dryRuns ноль', async () => {
  seedLiveUser();
  const result = await runAutoApply();
  assert.equal(result.dryRuns ?? 0, 0);
});

test('потеря лока останавливает прогон с частичным итогом, а не продолжает поверх чужого', async () => {
  const uid = seedLiveUser();
  let calls = 0;
  const result = await runAutoApply({
    heartbeat: () => {
      calls++;
      return false;
    },
  });
  assert.equal(calls, 1, 'heartbeat обязан вызываться, иначе потеря лока не детектится');
  assert.equal(result.ran, false, 'прогон без лока обязан остановиться');
  assert.equal(result.applied, 0);
  const count = db.prepare('SELECT COUNT(*) AS c FROM applications WHERE user_id = ?').get(uid) as {
    c: number;
  };
  assert.equal(count.c, 0, 'после потери лока отправлять нельзя');
});
