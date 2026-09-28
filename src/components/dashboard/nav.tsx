"use client";

import type { JSX } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/dashboard/ui";

type Item = { href: string; label: string; icon: JSX.Element };

const iconCls = "size-4.5";

const items: Item[] = [
  {
    href: "/dashboard",
    label: "Обзор",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className={iconCls}>
        <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="3" width="8" height="5" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="10" width="8" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    href: "/dashboard/resumes",
    label: "Резюме",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className={iconCls}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M14 3v5h5M9 13h6M9 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/dashboard/jobs",
    label: "Вакансии",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className={iconCls}>
        <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    href: "/dashboard/applications",
    label: "Отклики",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className={iconCls}>
        <path d="m22 2-7 20-4-9-9-4 20-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/dashboard/letters",
    label: "Письма",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className={iconCls}>
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="m3 7 9 6 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/dashboard/consultations",
    label: "Консультации",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className={iconCls}>
        <path d="M12 3a9 9 0 0 0-7.6 13.6L3 21l4.4-1.4A9 9 0 1 0 12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8.5 10h7M8.5 13.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Настройки",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className={iconCls}>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export function DashboardNav({
  name,
  email,
  planLabel,
  planActive,
  planDays,
  planLimit,
  onMobile,
  onClose,
}: {
  name: string;
  email: string;
  planLabel: string;
  planActive: boolean;
  planDays: number;
  planLimit: number;
  onMobile?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <nav
      className={`flex flex-col gap-1 ${onMobile ? "flex lg:hidden" : "hidden lg:flex"}`}
      aria-label="Навигация кабинета"
    >
      <div className="mb-2 flex items-center gap-3 px-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-white">
          {name.trim().charAt(0).toUpperCase() || "U"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted">{email}</p>
        </div>
      </div>

      {items.map((item) => {
        const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-accent/15 text-accent" : "text-muted hover:bg-white/5 hover:text-ink"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}

      <div className="mt-4 rounded-2xl border border-line bg-white/[0.03] p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Тариф</span>
          <Badge tone={planActive ? "success" : "warn"}>{planActive ? "Активен" : "Не активен"}</Badge>
        </div>
        <p className="mt-2 text-sm font-semibold">{planLabel}</p>
        <p className="mt-1 text-xs text-muted">
          {planActive
            ? `${planLimit} откликов/день · осталось ${planDays} дн.`
            : "Активируйте пробный период в настройках"}
        </p>
        <Link
          href="/dashboard/settings"
          onClick={onClose}
          className="mt-3 block rounded-full border border-line bg-white/5 px-3 py-1.5 text-center text-xs font-semibold transition hover:bg-white/10"
        >
          Управлять тарифом
        </Link>
      </div>

      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-red-400/10 hover:text-red-300"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-4.5">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {busy ? "Выход…" : "Выйти"}
      </button>
    </nav>
  );
}