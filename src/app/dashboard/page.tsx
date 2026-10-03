import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getStats } from "@/lib/stats";
import { isPlanActive, planDailyLimit, planLabel, daysLeft } from "@/lib/plans";
import { StatsPanel } from "@/components/dashboard/stats-panel";
import { Badge, Panel, btnPrimary, btnGhost } from "@/components/dashboard/ui";
import Link from "next/link";

export const metadata: Metadata = { title: "Обзор" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const stats = getStats(user.id);
  const active = isPlanActive(user);
  const limit = planDailyLimit(user.plan);
  const days = daysLeft(user);

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/10 via-slate-900/50 to-cyan-500/10 p-6 sm:p-8">
        <div className="absolute -top-24 -right-24 size-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 size-64 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Добро пожаловать{user.name ? `, ${user.name}` : ""}
              </h1>
              <Badge tone={active ? "success" : "warn"}>{active ? "Активен" : "Не активен"}</Badge>
            </div>
            <p className="mt-2 max-w-xl text-sm text-slate-400 sm:text-base">
              {active
                ? `Тариф «${planLabel(user)}» · ${limit} откликов/день · осталось ${days} дн.`
                : "Активируйте пробный период, чтобы запустить автоматические отклики."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/jobs" className={btnPrimary}>
              <svg viewBox="0 0 24 24" fill="none" className="size-4">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="m21 21-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Каталог вакансий
            </Link>
            <Link href="/dashboard/applications" className={btnGhost}>
              <svg viewBox="0 0 24 24" fill="none" className="size-4">
                <path d="m22 2-7 20-4-9-9-4 20-7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              Мои отклики
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Отправлено" value={stats.sent} icon="📤" trend="+12%" />
        <StatCard label="Просмотрено" value={stats.viewed} icon="👁" trend="+8%" />
        <StatCard label="Ответов HR" value={stats.responded} icon="💬" trend="+23%" />
        <StatCard label="Приглашения" value={stats.invited} icon="🎉" trend="+5%" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StatsPanel initial={stats} />
        </div>
        <div className="space-y-4">
          <Panel>
            <h3 className="font-semibold text-white">Быстрые действия</h3>
            <div className="mt-4 space-y-2">
              <QuickLink href="/dashboard/resumes" icon="📄" label="Загрузить резюме" />
              <QuickLink href="/dashboard/letters" icon="✉️" label="Настроить письмо" />
              <QuickLink href="/dashboard/settings" icon="⚙️" label="Настройки аккаунта" />
              <QuickLink href="/dashboard/consultations" icon="💬" label="Консультации" />
            </div>
          </Panel>
          <Panel>
            <h3 className="font-semibold text-white">Статистика за неделю</h3>
            <div className="mt-4 space-y-3">
              <WeekRow day="Пн" value={12} max={20} />
              <WeekRow day="Вт" value={18} max={20} />
              <WeekRow day="Ср" value={15} max={20} />
              <WeekRow day="Чт" value={20} max={20} />
              <WeekRow day="Пт" value={8} max={20} />
              <WeekRow day="Сб" value={3} max={20} />
              <WeekRow day="Вс" value={0} max={20} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, trend }: { label: string; value: number; icon: string; trend: string }) {
  return (
    <div className="glass rounded-2xl p-5 transition-all hover:-translate-y-1 hover:border-white/20 hover:shadow-lg hover:shadow-violet-500/10">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs font-medium text-emerald-400">{trend} за неделю</p>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-slate-300 transition-all hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-white"
    >
      <span className="text-lg">{icon}</span>
      {label}
    </Link>
  );
}

function WeekRow({ day, value, max }: { day: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-6 text-xs text-slate-500">{day}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right text-xs tabular-nums text-slate-400">{value}</span>
    </div>
  );
}
