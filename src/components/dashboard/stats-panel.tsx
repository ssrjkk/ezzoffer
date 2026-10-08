"use client";

import { useEffect, useState } from "react";
import type { Stats } from "@/lib/stats";
import { StatCard, Panel } from "@/components/dashboard/ui";
import { TodayLimitBar } from "@/components/dashboard/plan-banner";

export function StatsPanel({ initial }: { initial: Stats }) {
  const [stats, setStats] = useState<Stats>(initial);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (alive && data.stats) setStats(data.stats);
      } catch {
      }
    };
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const max = Math.max(1, ...stats.series.map((d) => Math.max(d.sent, d.viewed, d.invited)));

  return (
    <div className="space-y-6">
      <TodayLimitBar today={stats.today} todayLimit={stats.todayLimit} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Отправлено" value={stats.sent} accent="accent" />
        <StatCard label="Просмотрено" value={stats.viewed} accent="accent-2" />
        <StatCard label="Ответов HR" value={stats.responded} accent="success" />
        <StatCard label="Приглашения" value={stats.invited} accent="success" />
        <StatCard label="Вопросы" value={stats.questions} accent="warn" />
        <StatCard label="Отказы" value={stats.declined} accent="warn" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Panel className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Просмотры</span>
          <span className="text-xl font-semibold tabular-nums text-white">{stats.viewRate}%</span>
        </Panel>
        <Panel className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Отответы HR</span>
          <span className="text-xl font-semibold tabular-nums text-white">{stats.respondRate}%</span>
        </Panel>
        <Panel className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Приглашения</span>
          <span className="text-xl font-semibold tabular-nums text-white">{stats.inviteRate}%</span>
        </Panel>
      </div>

      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold tracking-tight text-white">Динамика за 7 дней</h2>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-violet-500" /> Отправлено
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-cyan-400" /> Просмотрено
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-emerald-400" /> Приглашения
            </span>
          </div>
        </div>
        <div className="flex h-44 items-end gap-3">
          {stats.series.map((d) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-36 w-full items-end justify-center gap-1">
                <div
                  className="w-2.5 rounded-t bg-violet-500/80 transition-all hover:bg-violet-400"
                  style={{ height: `${(d.sent / max) * 100}%` }}
                  title={`${d.label}: ${d.sent} отправлено`}
                />
                <div
                  className="w-2.5 rounded-t bg-cyan-400/80 transition-all hover:bg-cyan-300"
                  style={{ height: `${(d.viewed / max) * 100}%` }}
                  title={`${d.label}: ${d.viewed} просмотрено`}
                />
                <div
                  className="w-2.5 rounded-t bg-emerald-400/80 transition-all hover:bg-emerald-300"
                  style={{ height: `${(d.invited / max) * 100}%` }}
                  title={`${d.label}: ${d.invited} приглашений`}
                />
              </div>
              <span className="text-[10px] text-slate-500">{d.label}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
