import type { VacancySource } from './vacancies/types';

/**
 * Подписи источников вакансий — единственное место.
 *
 * Лежит в отдельном модуле без зависимостей намеренно: подписи нужны и
 * клиентским компонентам («Вакансии», «Отклики»), а `vacancies/index.ts`
 * тянет `db` (better-sqlite3 → fs) и в браузере не собирается. Дублировать
 * карту в компонентах нельзя: было три версии с разными формулировками
 * («Greenhouse» против «Сайты компаний (Greenhouse)», пропущенные flru/kwork
 * показывались сырым id), и одна и та же вакансия называлась по-разному
 * в разных разделах.
 */
export const SOURCE_LABELS: Record<VacancySource, string> = {
  local: 'EZOffer',
  trudvsem: 'Работа России',
  hh: 'hh.ru',
  remoteok: 'RemoteOK',
  greenhouse: 'Сайты компаний (Greenhouse)',
  ashby: 'Сайты компаний (Ashby)',
  company: 'Сайты компаний (RSS)',
  x: 'X / Twitter',
  tg: 'Telegram-каналы',
  geekjob: 'GeekJob',
  jobicy: 'Jobicy (remote)',
  weworkremotely: 'We Work Remotely',
  rabota: 'Работа.ру',
  flru: 'FL.ru (фриланс)',
  kwork: 'Kwork (фриланс)',
};
