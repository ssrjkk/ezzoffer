import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { aiFirstSystemPrompt, enhanceResumeAIFirst } from '../src/lib/ai';
import { isTopPlan } from '../src/lib/plans';

/**
 * AI-first упаковка резюме — привилегия топ-тарифа без лимитов.
 *
 * Формулировки промпта — продукт: тесты фиксируют, что он требует JSON,
 * запрещает выдумывать факты и держит ATS-ограничения. Сломанный промпт
 * иначе замечали бы только по счёту API и мусору в резюме.
 */

let savedFetch: typeof globalThis.fetch;
let savedKey: string | undefined;

beforeEach(() => {
  savedFetch = globalThis.fetch;
  savedKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = 'test-key';
});

function mockChat(response: { status: number; body: string }, seen: { system?: string }): void {
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      messages?: { role?: string; content?: string }[];
    };
    seen.system = body.messages?.[0]?.content;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => response.body,
      json: async () => JSON.parse(response.body),
    } as unknown as Response;
  }) as typeof globalThis.fetch;
}

function restore(): void {
  globalThis.fetch = savedFetch;
  if (savedKey === undefined) delete process.env.AI_API_KEY;
  else process.env.AI_API_KEY = savedKey;
}

test('промпт требует JSON, честность и ATS', () => {
  const p = aiFirstSystemPrompt();
  assert.match(p, /JSON/, 'нет требования JSON-ответа');
  assert.match(p, /не выдумывай/i, 'нет запрета выдумывать факты');
  assert.match(p, /ATS/, 'нет ATS-ограничений');
  assert.match(p, /AI-first/, 'нет AI-first рамки');
  assert.match(p, /MCP|агент/i, 'нет направлений AI-опыта');
});

test('топ-тариф — только эксперт и вечная бета', () => {
  assert.equal(isTopPlan('expert'), true);
  assert.equal(isTopPlan('beta_life'), true);
  for (const plan of ['trial', 'start', 'pro', 'none', '', 'gold']) {
    assert.equal(isTopPlan(plan), false, `«${plan}» посчитан топ-тарифом`);
  }
});

test('AI-first разбирает ответ провайдера и шлёт свою рамку', async () => {
  const seen: { system?: string } = {};
  mockChat(
    {
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                content: 'Опыт с Claude Code...',
                notes: ['n1'],
                tips: ['t1'],
              }),
            },
          },
        ],
      }),
    },
    seen,
  );
  try {
    const res = await enhanceResumeAIFirst('Делал бэкенд 5 лет.');
    assert.ok(res, 'валидный ответ не разобран');
    assert.equal(res?.content, 'Опыт с Claude Code...');
    assert.deepEqual(res?.notes, ['n1']);
    assert.match(seen.system ?? '', /AI-first/, 'ушла не та системная рамка');
  } finally {
    restore();
  }
});

test('кривой ответ провайдера — null, а не мусор', async () => {
  const seen: { system?: string } = {};
  mockChat({ status: 200, body: 'не json' }, seen);
  try {
    assert.equal(await enhanceResumeAIFirst('текст'), null, 'мусор принят за упаковку');
  } finally {
    restore();
  }
});

test('без ключа провайдера — null сразу, без сети', async () => {
  delete process.env.AI_API_KEY;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
  }) as typeof globalThis.fetch;
  try {
    assert.equal(await enhanceResumeAIFirst('текст'), null);
    assert.equal(called, false, 'сеть дёрнута без ключа');
  } finally {
    restore();
  }
});
