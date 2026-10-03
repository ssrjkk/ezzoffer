"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function TopBar({
  name,
  email,
  planLabel,
  planActive,
  planDays,
}: {
  name: string;
  email: string;
  planLabel: string;
  planActive: boolean;
  planDays: number;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/25 transition-transform group-hover:scale-105">
              <svg viewBox="0 0 24 24" fill="none" className="size-5 text-white">
                <path d="M13 2 4.5 13.5h6L11 22l8.5-11.5h-6L13 2Z" fill="currentColor" />
              </svg>
            </span>
            <span className="hidden text-lg font-bold tracking-tight text-white sm:block">
              EZ<span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">Offer</span>
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 sm:flex">
            <span className={`size-2 rounded-full ${planActive ? "bg-emerald-400" : "bg-amber-400"} animate-pulse-dot`} />
            <span className="text-xs font-medium text-slate-300">{planLabel}</span>
            {planActive && (
              <span className="text-xs text-slate-500">· {planDays} дн.</span>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1.5 transition hover:bg-white/10"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-bold text-white">
                {name.trim().charAt(0).toUpperCase() || "U"}
              </span>
              <svg viewBox="0 0 24 24" fill="none" className={`size-4 text-slate-400 transition-transform ${menuOpen ? "rotate-180" : ""}`}>
                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/50">
                <div className="border-b border-white/10 p-4">
                  <p className="text-sm font-semibold text-white">{name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{email}</p>
                </div>
                <div className="p-2">
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="size-4">
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    Настройки
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-400 transition hover:bg-red-500/10"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="size-4">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Выйти
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
