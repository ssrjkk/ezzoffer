import type { User } from "./db";

export type PlanId = "none" | "trial" | "start" | "pro" | "expert";

export const PLAN_NAMES: Record<string, string> = {
  none: "Нет тарифа",
  trial: "Пробный (24 часа)",
  start: "Старт",
  pro: "Про",
  expert: "Эксперт",
};

export function planDailyLimit(plan: string): number {
  switch (plan) {
    case "trial":
    case "start":
      return 50;
    case "pro":
      return 100;
    case "expert":
      return 250;
    default:
      return 0;
  }
}

/** Число резюме, доступных по тарифу. 0 = не ограничено (0 активный тариф блокирует по isPlanActive). */
export function planResumeLimit(plan: string): number {
  switch (plan) {
    case "start":
      return 1;
    case "trial":
    case "pro":
    case "expert":
      return 0;
    default:
      return 0;
  }
}

export function isPlanActive(user: Pick<User, "plan" | "plan_expires_at"> | undefined): boolean {
  if (!user) return false;
  return Boolean(user.plan_expires_at && user.plan_expires_at > Date.now());
}

export function planLabel(user: Pick<User, "plan"> | undefined): string {
  return PLAN_NAMES[user?.plan ?? "none"] ?? user?.plan ?? "Нет тарифа";
}

export function planExpiresInMs(user: Pick<User, "plan_expires_at"> | undefined): number {
  if (!user?.plan_expires_at) return 0;
  return Math.max(0, user.plan_expires_at - Date.now());
}

export function daysLeft(user: Pick<User, "plan_expires_at"> | undefined): number {
  return Math.ceil(planExpiresInMs(user) / (24 * 60 * 60 * 1000));
}