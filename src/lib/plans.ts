import type { User } from './db';
import { catalogItem } from './payments/catalog';

export type PlanId = 'none' | 'trial' | 'start' | 'pro' | 'expert' | 'beta_life';

export const PLAN_NAMES: Record<string, string> = {
  none: 'Нет тарифа',
  trial: 'Пробный (24 часа)',
  start: 'Старт',
  pro: 'Про',
  expert: 'Эксперт',
  beta_life: 'Навсегда (бета)',
};

/**
 * Топ-тариф: Эксперт и вечная бета с лимитами Эксперта.
 *
 * Здесь живут привилегии без лимитов — AI-first упаковка резюме и подобные:
 * квота считается не на запрос, а на тариф. Новый «безлимит» добавляется
 * сюда, а не размазывается проверками `plan === 'expert'` по роутам.
 */
export function isTopPlan(plan: string): boolean {
  return plan === 'expert' || plan === 'beta_life';
}

export function planDailyLimit(plan: string): number {
  switch (plan) {
    case 'trial':
    case 'start':
      return 50;
    case 'pro':
      return 100;
    case 'beta_life':
    case 'expert':
      return 250;
    default:
      return 0;
  }
}

/**
 * Число резюме, доступных по тарифу. 0 = не ограничено.
 *
 * Значения — те же, что в каталоге тарифов (payments/catalog.ts): расхождение
 * когда-то показывало человеку «5 резюме» на витрине и резало на первом.
 * Источник правды для enforcement — эта функция, витрина обязана повторять
 * её числа, а не наоборот.
 */
export function planResumeLimit(plan: string): number {
  switch (plan) {
    case 'start':
      return 5;
    case 'pro':
      return 20;
    case 'trial':
    case 'beta_life':
    case 'expert':
      return 0;
    default:
      return 0;
  }
}

/*
 * Активен ли тариф.
 *
 * Раньше проверялся только срок — `plan_expires_at > now`. Оплаченный
 * `beta_life` ставит expires_at в NULL («вечно» — см. entitlements.grant), и
 * Boolean(null && ...) давал false. Человек платил за «навсегда», вебхук
 * честно писал plan = "beta_life", а автоотклик его пропускал: тариф
 * неактивен. Оплата без сервиса — самая дорогая поломка в этом файле.
 *
 * Постоянство читается из каталога, а не захардкожено: какой тариф вечный —
 * решает каталог, plans только спрашивает. Зависимость в сторону лёгкого
 * модуля (массив + типы, без БД), цикла с payments нет — тот plans не
 * импортирует.
 */
export function isPlanActive(user: Pick<User, 'plan' | 'plan_expires_at'> | undefined): boolean {
  if (!user) return false;
  if (catalogItem(user.plan)?.permanent) return true;
  return Boolean(user.plan_expires_at && user.plan_expires_at > Date.now());
}

export function planLabel(user: Pick<User, 'plan'> | undefined): string {
  return PLAN_NAMES[user?.plan ?? 'none'] ?? user?.plan ?? 'Нет тарифа';
}

export function planExpiresInMs(user: Pick<User, 'plan_expires_at'> | undefined): number {
  if (!user?.plan_expires_at) return 0;
  return Math.max(0, user.plan_expires_at - Date.now());
}

export function daysLeft(user: Pick<User, 'plan_expires_at'> | undefined): number {
  return Math.ceil(planExpiresInMs(user) / (24 * 60 * 60 * 1000));
}
