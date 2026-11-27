import test, { before } from 'node:test';
import assert from 'node:assert/strict';

import {
  authCalls,
  post,
  setVerifyPasswordResult,
  useInMemoryDb as prepareInMemoryDb,
} from './helpers/route-session';

prepareInMemoryDb({ NODE_ENV: 'test', TRUST_PROXY: undefined, SMTP_HOST: undefined });
const mutableEnv = process.env as Record<string, string | undefined>;

let db: typeof import('../src/lib/db').db;
let rateLimit: typeof import('../src/lib/rate-limit').rateLimit;
let login: typeof import('../src/app/api/auth/login/route').POST;
let register: typeof import('../src/app/api/auth/register/route').POST;

before(async () => {
  db = (await import('../src/lib/db')).db;
  rateLimit = (await import('../src/lib/rate-limit')).rateLimit;
  login = (await import('../src/app/api/auth/login/route')).POST;
  register = (await import('../src/app/api/auth/register/route')).POST;
});

const ACCOUNT_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 };

function createUser(email: string): void {
  db.prepare(
    'INSERT INTO users (email, name, password_hash, email_verified, created_at) VALUES (?, ?, ?, 1, ?)',
  ).run(email, 'Owner', 'unused', Date.now());
}

test('верный пароль проходит после десяти неудачных попыток', async () => {
  const email = 'owner@example.com';
  createUser(email);
  for (let attempt = 0; attempt < ACCOUNT_LIMIT.max; attempt++) {
    assert.equal(rateLimit(`login-account:${email}`, ACCOUNT_LIMIT).allowed, true);
  }

  setVerifyPasswordResult(true);
  const before = authCalls.verifyPassword;
  const response = await login(post({ email, password: 'correct-password' }));

  assert.equal(response.status, 200, 'чужой перебор не должен блокировать владельца');
  assert.ok(authCalls.verifyPassword > before, 'пароль должен проверяться до решения о лимите');
  assert.match(response.headers.get('set-cookie') ?? '', /ez_session=/);
});

test('одиннадцатая неверная попытка получает 429', async () => {
  const email = 'attacker@example.com';
  createUser(email);
  setVerifyPasswordResult(false);
  try {
    for (let attempt = 0; attempt < ACCOUNT_LIMIT.max; attempt++) {
      const response = await login(post({ email, password: 'wrong-password' }));
      assert.equal(response.status, 401, `неудачная попытка ${attempt + 1}`);
    }
    const blocked = await login(post({ email, password: 'wrong-password' }));
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  } finally {
    setVerifyPasswordResult(true);
  }
});

test('production без SMTP не регистрирует неподтверждённый email', async () => {
  const previous = mutableEnv.NODE_ENV;
  mutableEnv.NODE_ENV = 'production';
  delete mutableEnv.SMTP_HOST;
  try {
    const email = 'no-smtp@example.com';
    const response = await register(post({ name: 'No SMTP', email, password: 'testpass123' }));
    assert.equal(response.status, 503);
    const count = db.prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?').get(email) as {
      count: number;
    };
    assert.equal(count.count, 0, 'аккаунт не должен появиться после отказа регистрации');
  } finally {
    if (previous === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previous;
  }
});

test('development без SMTP сохраняет локальный сценарий регистрации', async () => {
  const previous = mutableEnv.NODE_ENV;
  mutableEnv.NODE_ENV = 'development';
  delete mutableEnv.SMTP_HOST;
  try {
    const email = 'local@example.com';
    const response = await register(post({ name: 'Local', email, password: 'testpass123' }));
    assert.equal(response.status, 201);
    const user = db.prepare('SELECT email_verified FROM users WHERE email = ?').get(email) as {
      email_verified: number;
    };
    assert.equal(user.email_verified, 1);
  } finally {
    if (previous === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previous;
  }
});
