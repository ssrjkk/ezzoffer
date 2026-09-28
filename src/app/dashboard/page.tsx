import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getStats } from "@/lib/stats";
import { isPlanActive } from "@/lib/plans";
import { StatsPanel } from "@/components/dashboard/stats-panel";
import { PlanBanner } from "@/components/dashboard/plan-banner";

export const metadata: Metadata = { title: "Обзор" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const stats = getStats(user.id);
  const active = isPlanActive(user);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Обзор</h1>
          <p className="mt-1 text-sm text-muted">
            {active
              ? "Ваши отклики обновляются каждые 5 секунд в реальном времени."
              : "Активируйте пробный период, чтобы запустить автоматические отклики."}
          </p>
        </div>
      </div>

      <PlanBanner active={active} trialStarted={Boolean(user.trial_started_at)} />
      <StatsPanel initial={stats} />
    </div>
  );
}