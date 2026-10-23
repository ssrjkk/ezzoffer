import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Синхронизация статусов с hh.ru: что пишется в applications и что — нет.
 *
 * Путь разбора переписок не имел прямых тестов: только через живую площадку.
 * Закрывают два инварианта из кода, которые код нарушал:
 *
 * 1. Приглашение сильнее последующего отказа: отклик, который сначала
 *    пригласили, а потом отклонили, остаётся приглашением с пометкой —
 *    безусловный UPDATE затирал interview в decline, и приглашение исчезало
 *    из статистики навсегда.
 * 2. Повторная синхронизация тех же данных не пишет ничего: раньше каждый
 *    тик переписывал все закрытые/приглашённые строки теми же значениями
 *    (WAL-шум + врёт счётчик updated).
 */

let db: ReturnType<typeof import('../src/lib/db').createDatabase>;

const NOW = Date.now();

function seedUser(): number {
  return Number(
    db
      .prepare(
        `INSERT INTO users (email, password_hash, plan, plan_expires_at, created_at, hh_token,
          hh_token_expires_at, hh_resume_id, mode)
         VALUES (?, 'h', 'pro', ?, ?, 'tok', ?, 'res1', 'live')`,
      )
      .run('s@example.com', NOW + 100_000, NOW, NOW + 3_600_000).lastInsertRowid,
  );
}

function seedApp(userId: number, slug: string): number {
  return Number(
    db
      .prepare(
        `INSERT INTO applications (user_id, job_slug, status, sent_at) VALUES (?, ?, 'sent', ?)`,
      )
      .run(userId, slug, NOW - 1000).lastInsertRowid,
  );
}

function row(appId: number): {
  status: string;
  response: string;
  response_note: string;
  viewed_at: number | null;
  responded_at: number | null;
} {
  return db.prepare('SELECT status, response, response_note, viewed_at, responded_at FROM applications WHERE id = ?').get(
    appId,
  ) as never;
}

/** Мок GET /negotiations: отдаёт заданные переписки постранично. */
function mockNegotiations(
  items: { vacancyId: string; state: string; name: string; reviewed: boolean }[],
) {
  const saved = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/negotiations') && !u.includes('/negotiations/')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            items: items.map((n) => ({
              state: { id: n.state, name: n.name },
              vacancy: { id: n.vacancyId },
              reviewed: n.reviewed,
              updated_at: new Date(NOW).toISOString(),
            })),
            found: items.length,
          }),
      } as unknown as Response;
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
});

beforeEach(() => {
  db.exec('DELETE FROM applications; DELETE FROM users;');
});

test('отказ пишется один раз, повторный прогон ничего не меняет', async () => {
  const uid = seedUser();
  seedApp(uid, 'hh-123');
  const { syncHhStatuses } = await import('../src/lib/hh-sync');

  const restore = mockNegotiations([
    { vacancyId: '123', state: 'discard', name: 'Отказ: нет опыта', reviewed: true },
  ]);
  try {
    const first = await syncHhStatuses(uid);
    assert.equal(first.updated, 1, 'отказ не записан');
    const r = row(1);
    void r;
    const stored = db
      .prepare('SELECT status, response, responded_at FROM applications WHERE user_id = ?')
      .get(uid) as { status: string; response: string; responded_at: number | null };
    assert.equal(stored.status, 'declined');
    assert.equal(stored.response, 'decline');
    assert.ok(stored.responded_at, 'отказ без responded_at выпадает из конверсии');

    const second = await syncHhStatuses(uid);
    assert.equal(second.updated, 0, 'повтор переписал стабильную строку');
  } finally {
    restore();
  }
});

test('приглашение не затирается последующим отказом', async () => {
  const uid = seedUser();
  seedApp(uid, 'hh-456');
  const { syncHhStatuses } = await import('../src/lib/hh-sync');

  let restore = mockNegotiations([
    { vacancyId: '456', state: 'invitation', name: 'Приглашение', reviewed: true },
  ]);
  try {
    await syncHhStatuses(uid);
  } finally {
    restore();
  }
  const afterInvite = db
    .prepare('SELECT response FROM applications WHERE user_id = ?')
    .get(uid) as { response: string };
  assert.equal(afterInvite.response, 'interview', 'приглашение не записалось');

  restore = mockNegotiations([
    { vacancyId: '456', state: 'discard', name: 'Отказ после приглашения', reviewed: true },
  ]);
  try {
    await syncHhStatuses(uid);
  } finally {
    restore();
  }
  const afterDiscard = db
    .prepare('SELECT status, response, response_note FROM applications WHERE user_id = ?')
    .get(uid) as { status: string; response: string; response_note: string };
  assert.equal(
    afterDiscard.response,
    'interview',
    `приглашение затёрто отказом: ${JSON.stringify(afterDiscard)}`,
  );
  assert.match(afterDiscard.response_note, /Отказ после приглашения/, 'пометка об отказе потеряна');
});
