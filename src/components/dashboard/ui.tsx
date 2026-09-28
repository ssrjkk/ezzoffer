import type { JSX } from "react";

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`glass rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  accent = "accent",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: JSX.Element;
  accent?: "accent" | "accent-2" | "success" | "warn";
}) {
  const color = {
    accent: "bg-accent/15 text-accent",
    "accent-2": "bg-accent-2/15 text-accent-2",
    success: "bg-success/15 text-success",
    warn: "bg-warn/15 text-warn",
  }[accent];
  return (
    <div className="glass flex flex-col gap-2.5 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted">{label}</span>
        {icon ? <span className={`grid size-8 place-items-center rounded-lg ${color}`}>{icon}</span> : null}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">{value}</span>
        {sub ? <span className="text-xs text-muted">{sub}</span> : null}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "warn" | "danger" | "cyan";
}) {
  const cls = {
    neutral: "border-line bg-white/5 text-muted",
    accent: "border-accent/30 bg-accent/10 text-accent",
    success: "border-success/30 bg-success/10 text-success",
    warn: "border-warn/30 bg-warn/10 text-warn",
    danger: "border-red-400/30 bg-red-400/10 text-red-300",
    cyan: "border-accent-2/30 bg-accent-2/10 text-accent-2",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-bg/60 px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/30";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_28px_-8px_rgba(124,92,255,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-white/5 px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";

export const btnDanger =
  "inline-flex items-center justify-center gap-2 rounded-full border border-red-400/30 bg-red-400/10 px-4 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-50";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent">
        <svg viewBox="0 0 24 24" className="size-6" fill="none">
          <path d="M12 3v3m0 12v3M3 12h3m12 0h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-muted">{text}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}