import type { JSX } from "react";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "accent-2" | "cyan" | "success" | "warn" | "danger";
}) {
  const cls = {
    neutral: "border-line bg-surface-2 text-muted",
    accent: "border-accent/20 bg-accent/10 text-accent",
    "accent-2": "border-accent-2/20 bg-accent-2/10 text-accent-2",
    cyan: "border-cyan/20 bg-cyan/10 text-cyan",
    success: "border-success/20 bg-success/10 text-success",
    warn: "border-warn/20 bg-warn/10 text-warn",
    danger: "border-danger/20 bg-danger/10 text-danger",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function SectionHead({
  eyebrow,
  title,
  sub,
  center = true,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  center?: boolean;
}) {
  return (
    <div className={`mb-12 md:mb-16 ${center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}`}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      <h2 className="text-3xl font-semibold leading-tight tracking-tight text-ink md:text-5xl">
        {title}
      </h2>
      {sub ? <p className="mt-4 text-base leading-relaxed text-muted md:text-lg">{sub}</p> : null}
    </div>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
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
  accent?: "accent" | "accent-2" | "cyan" | "success" | "warn";
}) {
  const color = {
    accent: "bg-accent/10 text-accent",
    "accent-2": "bg-accent-2/10 text-accent-2",
    cyan: "bg-cyan/10 text-cyan",
    success: "bg-success/10 text-success",
    warn: "bg-warn/10 text-warn",
  }[accent];
  return (
    <div className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-accent/20">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted">{label}</span>
        {icon ? <span className={`grid size-8 place-items-center rounded-lg ${color}`}>{icon}</span> : null}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-ink">{value}</span>
        {sub ? <span className="text-xs text-muted">{sub}</span> : null}
      </div>
    </div>
  );
}

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
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-accent/10 text-accent">
        <svg viewBox="0 0 24 24" className="size-6" fill="none">
          <path d="M12 3v3m0 12v3M3 12h3m12 0h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-ink">{title}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-muted">{text}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-line bg-bg px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/20";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-accent/30 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

export const btnDanger =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger transition hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-50";