import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

/**
 * 401 из синхронизации hh.ru превращается в предупреждение человеку.
 *
 * Раньше syncHhStatuses возвращал только { updated, error }: мёртвый токен
 * выглядел как «сеть», планировщик писал его в лог — и всё. Отклики и
 * статусы вставали, а человек узнавал об этом никак. Теперь 401 помечается
 * флагом authFailed, syncAllHhUsers возвращает список таких пользователей,
 * а планировщик будит каждого.
 */

type Database = ReturnType<typeof import('../src/lib/db').createDatabase>;

let db: Database;
let savedFetch: typeof globalThis.fetch;

function seedUser(): number {
  return Number(
    db
      .prepare(
        `INSERT INTO users (email, password_hash, plan, plan_expires_at, created_at, hh_token,
          hh_token_expires_at, hh_resume_id, mode, telegram_chat_id)
         VALUES ('s@example.com', 'h', 'pro', ?, ?, 'tok', ?, 'res1', 'live', 'chat-1')`,
      )
      .run(Date.now() + 100_000, Date.now(), Date.now() + 3_600_000).lastInsertRowid,
  );
}

/** Пользователь с протухшим токеном и живым refresh_token. */
function seedExpiredUser(): number {
  return Number(
    db
      .prepare(
        `INSERT INTO users (email, password_hash, plan, plan_expires_at, created_at, hh_token,
          hh_token_expires_at, hh_refresh_token, hh_resume_id, mode)
         VALUES ('e@example.com', 'h', 'pro', ?, ?, 'tok', ?, 'ref', 'res1', 'live')`,
      )
      .run(Date.now() + 100_000, Date.now(), Date.now() - 1000).lastInsertRowid,
  );
}

/** Мок переговоров: 401 на первой странице — мёртвый токен. */
function mock401(): () => void {
  const saved = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url).includes('/negotiations')) {
      return { ok: false, status: 401, text: async () => 'Unauthorized' } as unknown as Response;
    }
    return saved(url);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = saved;
  };
}

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  db = (await import('../src/lib/db')).db;
  savedFetch = globalThis.fetch;
});

after(() => {
  globalThis.fetch = savedFetch;
});

beforeEach(() => {
  db.exec('DELETE FROM applications; DELETE FROM users; DELETE FROM meta;');
});

test('401 помечается authFailed, а не просто error', async () => {
  const uid = seedUser();
  const { syncHhStatuses } = await import('../src/lib/hh-sync');
  const restore = mock401();
  try {
    const res = await syncHhStatuses(uid);
    assert.equal(res.updated, 0);
    assert.ok(res.error, 'ошибка потеряна');
    assert.equal(res.authFailed, true, '401 не помечен как смерть токена');
  } finally {
    restore();
  }
});

test('syncAllHhUsers возвращает пользователей с мёртвым токеном', async () => {
  const uid = seedUser();
  const { syncAllHhUsers } = await import('../src/lib/hh-sync');
  const restore = mock401();
  try {
    const failed = await syncAllHhUsers();
    assert.deepEqual(failed, [uid], 'мёртвый токен потерян в общем прогоне');
  } finally {
    restore();
  }
});

test('403 тоже помечается authFailed', async () => {
  const uid = seedUser();
  const { syncHhStatuses } = await import('../src/lib/hh-sync');
  const saved = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url).includes('/negotiations')) {
      return { ok: false, status: 403, text: async () => 'Forbidden' } as unknown as Response;
    }
    return saved(url);
  }) as typeof fetch;
  try {
    const res = await syncHhStatuses(uid);
    assert.equal(res.authFailed, true, '403 не помечен смертью доступа');
  } finally {
    globalThis.fetch = saved;
  }
});

test('обрыв на второй странице обрабатывает частичное и возвращает ошибку', async () => {
  const uid = seedUser();
  db.prepare('INSERT INTO applications (user_id, job_slug, status, sent_at) VALUES (?, ?, ?, ?)').run(
    uid,
    'hh-1',
    'sent',
    Date.now() - 1000,
  );
  const { syncHhStatuses } = await import('../src/lib/hh-sync');
  const saved = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/negotiations')) {
      if (u.includes('page=0')) {
        // Полная страница (100 = PAGE_LIMIT), иначе цикл встанет до ошибки.
        const items = Array.from({ length: 100 }, () => ({
          state: { id: 'response', name: 'Ответ' },
          vacancy: { id: '1' },
          reviewed: true,
          updated_at: new Date().toISOString(),
        }));
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ items, found: 150 }),
        } as unknown as Response;
      }
      return { ok: false, status: 500, text: async () => 'error' } as unknown as Response;
    }
    return saved(url);
  }) as typeof fetch;
  try {
    const res = await syncHhStatuses(uid);
    assert.equal(res.updated, 1, 'частичная выдача не обработана');
    assert.ok(res.error, 'обрыв глубокой страницы промолчал');
  } finally {
    globalThis.fetch = saved;
  }
});

test('sameVacancyId сравнивает как числа', async () => {
  const { sameVacancyId } = await import('../src/lib/hh-sync');
  assert.equal(sameVacancyId('30251545', '030251545'), true);
  assert.equal(sameVacancyId('1', '1'), true);
  assert.equal(sameVacancyId('1', '2'), false);
  assert.equal(sameVacancyId(null, '1'), false);
  assert.equal(sameVacancyId('abc', 'abc'), true, 'нечисловые сравниваются строками');
  assert.equal(sameVacancyId('abc', 'abd'), false);
});

/** Мок успешных переговоров со счётчиком GET. */
function mockOk(counter: { gets: number }): () => void {
  const saved = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url).includes('/negotiations')) {
      counter.gets++;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: [], found: 0 }),
      } as unknown as Response;
    }
    return saved(url);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = saved;
  };
}

test('повторный опрос внутри интервала в сеть не ходит', async () => {
  const uid = seedUser();
  const { syncHhStatuses } = await import('../src/lib/hh-sync');
  const counter = { gets: 0 };
  const restore = mockOk(counter);
  try {
    const first = await syncHhStatuses(uid);
    assert.equal(first.throttled, undefined, 'первый опрос заткнули троттлингом');
    assert.equal(counter.gets, 1, 'первый опрос не дошёл до сети');
    const second = await syncHhStatuses(uid);
    assert.equal(second.updated, 0);
    assert.equal(second.throttled, true, 'повторный опрос не помечен троттлингом');
    assert.equal(counter.gets, 1, 'повторный опрос ударил в сеть');
  } finally {
    restore();
  }
});

test('force обходит троттлинг, старая отметка разрешает опрос', async () => {
  const uid = seedUser();
  const { syncHhStatuses, hhSyncMinIntervalMs } = await import('../src/lib/hh-sync');
  const counter = { gets: 0 };
  const restore = mockOk(counter);
  try {
    await syncHhStatuses(uid);
    assert.equal(counter.gets, 1);
    const forced = await syncHhStatuses(uid, { force: true });
    assert.equal(forced.throttled, undefined, 'force не обошёл троттлинг');
    assert.equal(counter.gets, 2, 'force не дошёл до сети');
    // Отметка старше интервала — обычный опрос снова идёт в сеть.
    db.prepare('UPDATE meta SET value = ? WHERE key = ?').run(
      String(Date.now() - hhSyncMinIntervalMs() - 1000),
      `hh:last-sync:${uid}`,
    );
    const afterWindow = await syncHhStatuses(uid);
    assert.equal(afterWindow.throttled, undefined, 'опрос после окна заткнули');
    assert.equal(counter.gets, 3, 'опрос после окна не дошёл до сети');
  } finally {
    restore();
  }
});

test('интервал опроса: дефолт 15 минут, пол — минута', async () => {
  const { hhSyncMinIntervalMs } = await import('../src/lib/hh-sync');
  assert.equal(hhSyncMinIntervalMs(), 15 * 60 * 1000, 'дефолт не 15 минут');
  process.env.HH_SYNC_MIN_INTERVAL_MS = '60000';
  assert.equal(hhSyncMinIntervalMs(), 60_000);
  process.env.HH_SYNC_MIN_INTERVAL_MS = '1000';
  assert.equal(hhSyncMinIntervalMs(), 60_000, 'пол минуты не держится');
  process.env.HH_SYNC_MIN_INTERVAL_MS = 'мусор';
  assert.equal(hhSyncMinIntervalMs(), 15 * 60 * 1000, 'мусор не даёт дефолт');
  delete process.env.HH_SYNC_MIN_INTERVAL_MS;
});

test('параллельное обновление токена делает один запрос', async () => {
  const uid = seedExpiredUser();
  process.env.HH_CLIENT_ID = 'id';
  process.env.HH_CLIENT_SECRET = 'secret';
  process.env.HH_REDIRECT_URI = 'https://example.com/api/hh/callback';
  let tokenCalls = 0;
  const saved = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url).includes('/token')) {
      tokenCalls++;
      // Задержка, чтобы оба вызова успели войти в refresh до ответа.
      await new Promise((r) => setTimeout(r, 30));
      const body = JSON.stringify({ access_token: 'fresh', expires_in: 3600 });
      return {
        ok: true,
        status: 200,
        text: async () => body,
        json: async () => JSON.parse(body),
      } as unknown as Response;
    }
    return saved(url);
  }) as typeof fetch;
  try {
    const { getValidHhToken } = await import('../src/lib/hh-oauth');
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as never;
    const [a, b] = await Promise.all([getValidHhToken(row), getValidHhToken(row)]);
    assert.equal(a?.token, 'fresh', 'первый не получил свежий токен');
    assert.equal(b?.token, 'fresh', 'второй не получил свежий токен');
    assert.equal(tokenCalls, 1, `второй refresh ушёл в сеть: запросов ${tokenCalls}`);
  } finally {
    globalThis.fetch = saved;
    delete process.env.HH_CLIENT_ID;
    delete process.env.HH_CLIENT_SECRET;
    delete process.env.HH_REDIRECT_URI;
  }
});
