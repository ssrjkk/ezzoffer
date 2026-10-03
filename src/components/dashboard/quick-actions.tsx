"use client";

import Link from "next/link";
import { Panel } from "@/components/dashboard/ui";

export function QuickActions({ active }: { active: boolean }) {
  const actions = [
    {
      href: "/dashboard/jobs",
      label: "Найти вакансии",
      desc: "Каталог с фильтрами",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="size-5">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
      color: "text-violet-400 bg-violet-500/15",
    },
    {
      href: "/dashboard/resumes",
      label: "Создать резюме",
      desc: "AI-улучшение",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="size-5">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M14 3v5h5M9 13h6M9 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
      color: "text-cyan-400 bg-cyan-500/15",
    },
    {
      href: "/dashboard/letters",
      label: "Написать письмо",
      desc: "Шаблоны + AI",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="size-5">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="m3 7 9 6 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      color: "text-emerald-400 bg-emerald-500/15",
    },
    {
      href: "/dashboard/settings",
      label: "Подключить hh.ru",
      desc: "OAuth-авторизация",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="size-5">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      color: "text-amber-400 bg-amber-500/15",
    },
  ];

  return (
    <Panel>
      <h2 className="font-semibold tracking-tight text-white">Быстрые действия</h2>
      <div className="mt-4 space-y-2">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:border-white/15 hover:bg-white/[0.05]"
          >
            <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${a.color}`}>
              {a.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{a.label}</p>
              <p className="text-xs text-slate-500">{a.desc}</p>
            </div>
          </Link>
        ))}
      </div>
      {!active && (
        <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Для автооткликов подключите hh.ru в настройках
        </p>
      )}
    </Panel>
  );
}