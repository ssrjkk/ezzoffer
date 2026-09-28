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
        /* ignore */
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
      {stats.hint ? (
        <div className="flex items-start gap-3 rounded-2xl border border-accent-2/30 bg-accent-2/10 p-4 text-sm leading-relaxed text-ink">
          <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-accent-2" fill="none">
            <path d="M12 8v4m0 4h.01M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <p>{stats.hint}</p>
        </div>
      ) : null}

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
          <span className="text-sm text-muted">Просмотры</span>
          <span className="text-xl font-semibold tabular-nums">{stats.viewRate}%</span>
        </Panel>
        <Panel className="flex items-center justify-between">
          <span className="text-sm text-muted">Ответы HR</span>
          <span className="text-xl font-semibold tabular-nums">{stats.respondRate}%</span>
        </Panel>
        <Panel className="flex items-center justify-between">
          <span className="text-sm text-muted">Приглашения</span>
          <span className="text-xl font-semibold tabular-nums">{stats.inviteRate}%</span>
        </Panel>
      </div>

      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold tracking-tight">Динамика за 7 дней</h2>
          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-accent" /> Отправлено
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-accent-2" /> Просмотрено
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-success" /> Приглашения
            </span>
          </div>
        </div>
        <div className="flex h-44 items-end gap-3">
          {stats.series.map((d) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-36 w-full items-end justify-center gap-1">
                <div
                  className="w-2.5 rounded-t bg-accent/80"
                  style={{ height: `${(d.sent / max) * 100}%` }}
                  title={`${d.label}: ${d.sent} отправлено`}
                />
                <div
                  className="w-2.5 rounded-t bg-accent-2/80"
                  style={{ height: `${(d.viewed / max) * 100}%` }}
                  title={`${d.label}: ${d.viewed} просмотрено`}
                />
                <div
                  className="w-2.5 rounded-t bg-success/80"
                  style={{ height: `${(d.invited / max) * 100}%` }}
                  title={`${d.label}: ${d.invited} приглашений`}
                />
              </div>
              <span className="text-[10px] text-muted">{d.label}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}