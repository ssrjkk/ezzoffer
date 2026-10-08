import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPlanActive, planDailyLimit, planLabel, daysLeft } from "@/lib/plans";
import { PlanSettings } from "@/components/dashboard/plan-settings";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { HhConnect } from "@/components/dashboard/hh-connect";
import { AutoApplyPause } from "@/components/dashboard/autoapply-pause";
import { TelegramConnect } from "@/components/dashboard/telegram-connect";

export const metadata: Metadata = { title: "Настройки" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const active = isPlanActive(user);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
        <p className="mt-1 text-sm text-muted">Профиль, тариф и данные аккаунта.</p>
      </div>

      <HhConnect />

      <TelegramConnect />

      <AutoApplyPause initialPaused={Boolean(user.autoapply_paused)} />

      <PlanSettings
        plan={user.plan}
        planLabel={planLabel(user)}
        active={active}
        planDays={daysLeft(user)}
        planLimit={active ? planDailyLimit(user.plan) : 0}
        trialStarted={Boolean(user.trial_started_at)}
        trialExpiresAt={user.plan_expires_at}
      />

      <ProfileForm name={user.name} email={user.email} />
    </div>
  );
}