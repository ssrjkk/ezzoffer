"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  Send,
  Mail,
  MessageCircle,
  Settings,
  LogOut,
} from "lucide-react";
import { Badge } from "@/components/dashboard/ui";

const items = [
  { href: "/dashboard", label: "Обзор", icon: LayoutDashboard },
  { href: "/dashboard/resumes", label: "Резюме", icon: FileText },
  { href: "/dashboard/jobs", label: "Вакансии", icon: Briefcase },
  { href: "/dashboard/applications", label: "Отклики", icon: Send },
  { href: "/dashboard/letters", label: "Письма", icon: Mail },
  { href: "/dashboard/consultations", label: "Консультации", icon: MessageCircle },
  { href: "/dashboard/settings", label: "Настройки", icon: Settings },
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
      <div className="mb-6 flex items-center gap-3 px-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-sm font-bold text-white">
          {name.trim().charAt(0).toUpperCase() || "U"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="truncate text-xs text-muted">{email}</p>
        </div>
      </div>

      <div className="space-y-0.5">
        {items.map((item) => {
          const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "text-accent" : "text-muted hover:text-ink hover:bg-surface-2"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent"
                />
              )}
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto space-y-4 pt-8">
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Тариф</span>
            <Badge tone={planActive ? "success" : "warn"}>{planActive ? "Активен" : "Не активен"}</Badge>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink">{planLabel}</p>
          <p className="mt-1 text-xs text-muted">
            {planActive
              ? `${planLimit} откликов/день · осталось ${planDays} дн.`
              : "Активируйте пробный период в настройках"}
          </p>
          <Link
            href="/dashboard/settings"
            onClick={onClose}
            className="mt-3 block rounded-lg border border-line bg-bg px-3 py-1.5 text-center text-xs font-semibold text-ink transition hover:border-accent/30"
          >
            Управлять тарифом
          </Link>
        </div>

        <button
          type="button"
          onClick={logout}
          disabled={busy}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-danger"
        >
          <LogOut className="size-4" />
          {busy ? "Выход…" : "Выйти"}
        </button>
      </div>
    </nav>
  );
}