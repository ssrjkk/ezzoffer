import { logError } from './logger';

/**
 * Реальное ИИ-улучшение резюме/писем через OpenAI-совместимый API.
 * Настраивается env: AI_API_KEY, AI_BASE_URL, AI_MODEL.
 * Без ключа возвращается null — вызывающий код использует локальные эвристики.
 */

export type AiEnhanceResult = {
  content: string;
  notes: string[];
  tips: string[];
};

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY?.trim());
}

const DEFAULT_MODEL = 'gpt-4o-mini';

function baseUrl(): string {
  return (process.env.AI_BASE_URL?.trim() ?? 'https://api.openai.com/v1').replace(/\/$/, '');
}

async function chat(prompt: string, system: string): Promise<string | null> {
  const key = process.env.AI_API_KEY?.trim();
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL?.trim() ?? DEFAULT_MODEL,
        temperature: 0.3,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logError('ai', new Error(`HTTP ${res.status}`), { detail: detail.slice(0, 300) });
      return null;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (e) {
    logError('ai', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function enhanceResumeWithAi(content: string): Promise<AiEnhanceResult | null> {
  const system =
    'Ты — карьерный консультант и эксперт по ATS-резюме. Улучши резюме кандидата: ' +
    'усиль формулировки, добавь измеримые результаты, структурируй, соблюдай правила ATS-парсеров ' +
    '(без таблиц, без графиков, без лишних стилей). Отвечай строго в JSON.';
  const prompt = `Улучши следующее резюме. Верни JSON вида: {"content": "...", "notes": ["..."], "tips": ["..."]}.
Резюме:
"""${content}"""`;

  const raw = await chat(prompt, system);
  if (!raw) return null;
  return parseEnhanceJson(raw, content);
}

/**
 * Системный промпт AI-first упаковки — чистая функция ради тестов.
 *
 * Держится отдельно от вызова, потому что формулировки здесь — продукт:
 * тесты фиксируют, что промпт требует JSON, запрещает выдумывать факты
 * и держит ATS-ограничения. Сломанный промпт иначе замечали бы только
 * по деньгам на счётчике API и мусору в резюме.
 */
export function aiFirstSystemPrompt(): string {
  return (
    'Ты — карьерный стратег AI-first рынка. Перепиши опыт кандидата в AI-first подаче: ' +
    'каждый буллет — «действие → AI-инструмент или подход → измеримый результат». ' +
    'Подсвечивай зацепки из текста: AI-assisted development (Claude Code, Codex, skills, hooks, плагины), ' +
    'агенты и оркестрация (MCP, multi-agent workflows, human-in-the-loop), AI code review и QA, ' +
    'LLM evals и guardrails, автоматизация on-call и релизов. ' +
    'ЖЁСТКИЙ ЗАПРЕТ: используй только факты и цифры из исходного текста — не выдумывай ни технологий, ' +
    'ни процентов, ни сроков, ни должностей. Если AI-опыта в тексте нет — не приписывай его, ' +
    'а усиль формулировки и в tips укажи, какие AI-навыки добрать. ' +
    'Соблюдай правила ATS-парсеров (без таблиц, без графиков, без лишних стилей). Отвечай строго в JSON.'
  );
}

function aiFirstUserPrompt(content: string): string {
  return (
    'Перепиши следующее резюме в AI-first подаче. Верни JSON вида: ' +
    '{"content": "...", "notes": ["..."], "tips": ["..."]}.\nРезюме:\n"""' +
    content +
    '"""'
  );
}

/**
 * AI-first упаковка резюме для топ-тарифа.
 *
 * От стандартного улучшения отличается не движком, а рамкой: та же модель,
 * но резюме переписывается под AI-first рынок вместо «просто улучшить».
 * Возвращает null, если провайдер недоступен или ответ не JSON, — вызывающий
 * код откатывается на стандартное улучшение, а не на мусор.
 */
export async function enhanceResumeAIFirst(content: string): Promise<AiEnhanceResult | null> {
  const raw = await chat(aiFirstUserPrompt(content), aiFirstSystemPrompt());
  if (!raw) return null;
  return parseEnhanceJson(raw, content);
}

function parseEnhanceJson(raw: string, fallback: string): AiEnhanceResult | null {
  try {
    const jsonText = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonText) as {
      content?: string;
      notes?: unknown;
      tips?: unknown;
    };
    const result: AiEnhanceResult = {
      content:
        typeof parsed.content === 'string' && parsed.content.trim()
          ? parsed.content.trim()
          : fallback,
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.filter((n): n is string => typeof n === 'string').slice(0, 10)
        : [],
      tips: Array.isArray(parsed.tips)
        ? parsed.tips.filter((t): t is string => typeof t === 'string').slice(0, 10)
        : [],
    };
    if (!result.notes.length) result.notes = ['Резюме улучшено с помощью ИИ'];
    if (!result.tips.length) result.tips = ['Добавьте конкретные цифры в разделы опыта'];
    return result;
  } catch {
    return null;
  }
}

export async function writeCoverLetterWithAi(
  vacancy: { title: string; company: string; about?: string },
  resume: string,
): Promise<string | null> {
  const system =
    'Ты — опытный HR-специалист, помогающий соискателям. Напиши персонализированное сопроводительное письмо ' +
    'по вакансии. Пиши от первого лица, без канцелярита, 3–5 абзацев, с конкретными фактами из резюме. ' +
    'Верни только текст письма без кавычек и пометок.';
  const prompt = `Вакансия: ${vacancy.title} (${vacancy.company})
${vacancy.about ? `Описание: ${vacancy.about.slice(0, 2000)}` : ''}

Резюме соискателя:
"""${resume.slice(0, 4000)}"""

Напиши сопроводительное письмо.`;

  return chat(prompt, system);
}
