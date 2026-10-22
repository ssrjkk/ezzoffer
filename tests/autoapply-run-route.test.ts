import test, { before } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Ручной запуск прогона: 202 сразу, работа в фоне.
 *
 * Раньше роут ждал runAutoApply целиком и отдавал итог в ответе. Теперь тик
 * длится десятки минут (паузы выжидаются внутри), и HTTP-клиент убил бы
 * соединение задолго до конца. Поэтому ответ — 202 { started: true } сразу,
 * а итог пишется в saveLastRun фоновой задачей и читается из /api/autoapply/state.
 *
 * Второй вызов, пока идёт первый, — 409, а не второй прогон поверх.
 */

const SECRET = 'cron-test-secret';

before(async () => {
  process.env.EZOFFER_DB_PATH = ':memory:';
  process.env.EZOFFER_SILENT = '1';
  process.env.CRON_SECRET = SECRET;
  await import('../src/lib/db');
});

function authed(body?: unknown): Request {
  return new Request('http://localhost/api/autoapply/run', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${SECRET}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('без секрета — 503, с чужим секретом — 401', async () => {
  const { POST } = await import('../src/app/api/autoapply/run/route');
  const saved = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    const noSecret = await POST(new Request('http://localhost/api/autoapply/run', { method: 'POST' }));
    assert.equal(noSecret.status, 503);
  } finally {
    process.env.CRON_SECRET = saved;
  }
  const wrong = await POST(
    new Request('http://localhost/api/autoapply/run', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong' },
    }),
  );
  assert.equal(wrong.status, 401);
});

test('запуск отвечает 202 сразу и отпускает блокировку по завершении', async () => {
  const { POST } = await import('../src/app/api/autoapply/run/route');
  const { lockHeldAtKey, APPLY_LOCK_KEY } = await import('../src/lib/scheduler');
  const { db } = await import('../src/lib/db');

  const res = await POST(authed());
  assert.equal(res.status, 202, `ожидался фоновый 202, получен ${res.status}`);
  const body = (await res.json()) as { ok: boolean; started: boolean };
  assert.equal(body.started, true);

  // Фоновая задача отрабатывает быстро (пользователей нет) и снимает лок.
  const deadline = Date.now() + 10_000;
  for (;;) {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(APPLY_LOCK_KEY) as
      | { value: string }
      | undefined;
    if (!row) break;
    assert.ok(Date.now() < deadline, 'фоновый прогон не снял блокировку за 10 секунд');
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(lockHeldAtKey(db, APPLY_LOCK_KEY), 0, 'apply-лок остался висеть');
});

test('второй запуск поверх идущего — 409, а не второй прогон', async () => {
  const { POST } = await import('../src/app/api/autoapply/run/route');
  const { acquireNamedLock, releaseNamedLock, APPLY_LOCK_KEY } = await import(
    '../src/lib/scheduler'
  );
  const { db } = await import('../src/lib/db');

  // Имитируем занятый планировщик: чужая метка моложе TTL.
  assert.equal(acquireNamedLock(db, APPLY_LOCK_KEY, Date.now()), true);
  try {
    const res = await POST(authed());
    assert.equal(res.status, 409, `поверх занятого лока обязан быть 409, а не запуск`);
    const body = (await res.json()) as { running: boolean };
    assert.equal(body.running, true);
  } finally {
    releaseNamedLock(db, APPLY_LOCK_KEY);
  }
});
