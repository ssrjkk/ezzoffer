import { jobs } from '../data';
import type { Vacancy, VacancyFetchResult, VacancyProvider, VacancyQuery } from './types';

/**
 * Минимум из строки витрины («от 250 000 ₽», «120 000–160 000 ₽»).
 *
 * Раньше понималось только «от ...»: диапазон давал null (фильтры считали
 * зарплату нулевой и пропускали всё), а «до 90 000 ₽» вообще не замечалось.
 * Строки витрины — рубли, нормализация не нужна.
 */
function parseSalaryMin(text: string): number | null {
  const nums = [...text.matchAll(/(\d[\d\s\u00A0]*)/g)]
    .map((m) => parseInt(m[1].replace(/[\s\u00A0]/g, ''), 10))
    .filter((n) => Number.isFinite(n) && n >= 10_000);
  if (nums.length === 0) return null;
  return Math.min(...nums);
}

export function localVacancy(job: (typeof jobs)[number]): Vacancy {
  return {
    slug: job.slug,
    source: 'local',
    source_id: job.slug,
    title: job.title,
    company: job.company,
    salary: job.salary,
    salary_min: parseSalaryMin(job.salary),
    salary_max: null,
    level: job.level,
    format: job.format,
    city: job.city,
    posted: job.posted,
    published_at: null,
    category: job.category,
    about: job.about,
    responsibilities: job.responsibilities,
    requirements: job.requirements,
    bonus: job.bonus,
    source_url: null,
    contact_email: null,
    contact_phone: null,
  };
}

export function allLocalVacancies(): Vacancy[] {
  return jobs.map(localVacancy);
}

export const localProvider: VacancyProvider = {
  source: 'local',
  label: 'EZOffer',
  isAvailable: () => true,
  async fetchVacancies(query: VacancyQuery): Promise<VacancyFetchResult> {
    let list = allLocalVacancies();
    if (query.text) {
      const t = query.text.toLowerCase();
      list = list.filter((v) => `${v.title} ${v.company} ${v.category}`.toLowerCase().includes(t));
    }
    if (query.city) {
      const c = query.city.toLowerCase();
      list = list.filter((v) => v.city.toLowerCase().includes(c));
    }
    if (query.limit && query.limit > 0) list = list.slice(0, query.limit);
    return { vacancies: list, provider: 'local', ok: true };
  },
};
