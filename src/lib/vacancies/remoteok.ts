import type { Level, WorkFormat } from '../data';
import type { Vacancy, VacancyFetchResult, VacancyProvider, VacancyQuery } from './types';
import { cleanHtml, sanitizeExternalUrl, toRubMonthly, toSalaryNumber } from './util';
import { parsePublishedAt } from './published';
import { httpFetch, parseJson } from '../http-client';

const BASE = 'https://remoteok.com/api';
const FETCH_TIMEOUT = 25_000;

type RemoteOkSalary = { min?: number | null; max?: number | null };

export type RemoteOkRaw = {
  slug?: string;
  id?: string | number;
  epoch?: number;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  url?: string;
  apply_url?: string;
  location?: string | string[];
  salary_min?: number | string | null;
  salary_max?: number | string | null;
  salary?: RemoteOkSalary;
  currency?: string;
};

/**
 * Сырые значения из API — ГОДОВЫЕ USD (конвенция RemoteOK: salary_min 120000
 * означает $120k в год). Возвращаются как есть; в рубли в месяц переводит
 * mapRemoteOkVacancy. Разделение намеренное: парсинг и нормализация —
 * разные решения, и тест проверяет парсинг без привязки к курсу.
 */
export function remoteOkSalaryValues(raw: RemoteOkRaw): { min: number | null; max: number | null } {
  const min = parseRemoteOkAmount(raw.salary?.min ?? raw.salary_min);
  const max = parseRemoteOkAmount(raw.salary?.max ?? raw.salary_max);
  if (
    min == null &&
    max == null &&
    typeof raw.salary_min === 'string' &&
    typeof raw.salary_max === 'string'
  ) {
    const s = parseRemoteOkAmount(raw.salary_min);
    const e = parseRemoteOkAmount(raw.salary_max);
    if (s != null && e != null && e >= s) return { min: s, max: e };
  }
  return { min, max };
}

/**
 * Число RemoteOK с суффиксами: API отдаёт и 120000, и "120k", и "$120k-$160k".
 *
 * Раньше "100k" превращалось в 100: toSalaryNumber давал null, а фолбэк
 * вырезал всё кроме цифр (`[^0-9-]`) и получал "100" — ошибка в 1000 раз.
 * Дальше вакансия с $100k/год выглядела как $100 и отлетала от фильтров.
 */
function parseRemoteOkAmount(v: number | string | null | undefined): number | null {
  if (typeof v === 'number') return toSalaryNumber(v);
  if (typeof v !== 'string') return null;
  const direct = toSalaryNumber(v);
  if (direct != null) return direct;
  const cleaned = v.replace(/[$,\s\u00A0]/g, '');
  const m = cleaned.match(/^([\d.]+)\s*([KkMm])?$/);
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base) || base <= 0) return null;
  const mult = m[2] ? (/[Mm]/.test(m[2]) ? 1_000_000 : 1_000) : 1;
  return Math.round(base * mult) || null;
}

export function mapRemoteOkVacancy(raw: RemoteOkRaw): Vacancy | null {
  if (!raw.slug && !raw.id) return null;
  const title = raw.position ?? 'Вакансия';
  const salary = remoteOkSalaryValues(raw);
  /*
   * Значения API — годовые USD. В рубли в месяц: /12 и курс. Display —
   * исходный вид ($120,000 — это годовая вилка площадки), min/max — рубли
   * в месяц для фильтров и скоринга. Без /12 вакансия $120k/год выглядела
   * как 120 000 ₽/мес и ломала фильтр «от 150 000» в обе стороны.
   */
  const salaryMinRub = toRubMonthly(salary.min, 'USD', 'year');
  const salaryMaxRub = toRubMonthly(salary.max, 'USD', 'year');
  const salaryField =
    salary.min != null && salary.max != null
      ? `$${salary.min.toLocaleString('en-US')}–$${salary.max.toLocaleString('en-US')}`
      : salary.min != null
        ? `от $${salary.min.toLocaleString('en-US')}`
        : salary.max != null
          ? `до $${salary.max.toLocaleString('en-US')}`
          : 'по договорённости';

  const loc = Array.isArray(raw.location) ? raw.location.join(', ') : (raw.location ?? 'Remote');
  const about = cleanHtml(raw.description ?? '');

  function inferLevel(name: string): Level {
    const s = name.toLowerCase();
    if (/(intern|trainee|student)/.test(s)) return 'Intern';
    if (/(junior|entry)/.test(s)) return 'Junior';
    if (/(senior|principal|lead|staff|director|head|manager)/.test(s)) return 'Senior';
    return 'Middle';
  }

  function inferFormat(): WorkFormat {
    const s = loc.toLowerCase();
    if (/(remote|distributed)/.test(s)) return 'Удалённо';
    if (/(hybrid)/.test(s)) return 'Гибрид';
    return 'В офисе';
  }

  return {
    slug: `remoteok-${raw.slug ?? raw.id}`,
    source: 'remoteok',
    source_id: String(raw.id ?? raw.slug),
    title,
    company: raw.company?.replace(/\s+$/g, '') ?? 'Компания',
    salary: salaryField,
    salary_min: salaryMinRub,
    salary_max: salaryMaxRub,
    level: inferLevel(title),
    format: inferFormat(),
    city: loc || 'Remote',
    posted: 'сегодня',
    published_at: parsePublishedAt(raw.date ?? null),
    category: 'Работа',
    about: about.slice(0, 2000) || 'Описание доступно на RemoteOK.',
    responsibilities: [],
    requirements: (raw.tags ?? []).slice(0, 10),
    bonus: [],
    source_url: sanitizeExternalUrl(raw.apply_url ?? raw.url),
    contact_email: null,
    contact_phone: null,
  };
}

export const remoteokProvider: VacancyProvider = {
  source: 'remoteok',
  label: 'RemoteOK',
  isAvailable: () => true,
  async fetchVacancies(query: VacancyQuery): Promise<VacancyFetchResult> {
    const res = await httpFetch(BASE, {
      timeoutMs: FETCH_TIMEOUT,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'EZOffer/1.0 (vacancy aggregator)',
        Referer: 'https://ezoffer.local/',
      },
    });
    if (!res.ok) {
      return {
        vacancies: [],
        provider: 'remoteok',
        ok: false,
        error: res.error ?? 'network error',
      };
    }
    const data = parseJson<RemoteOkRaw[]>(res.body);
    if (data === null) {
      return { vacancies: [], provider: 'remoteok', ok: false, error: 'некорректный JSON' };
    }

    // Первый элемент — служебный (legal/terms), пропускаем.
    const items = Array.isArray(data) ? data.slice(1) : [];
    let vacancies = items.map(mapRemoteOkVacancy).filter((v): v is Vacancy => Boolean(v));

    if (query.text) {
      const t = query.text.toLowerCase();
      vacancies = vacancies.filter((v) =>
        `${v.title} ${v.company} ${v.requirements.join(' ')}`.toLowerCase().includes(t),
      );
    }
    const limit = Math.min(Math.max(1, query.limit ?? 50), 100);
    return { vacancies: vacancies.slice(0, limit), provider: 'remoteok', ok: true };
  },
};
