import Link from "next/link";
import type { ReactNode } from "react";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium tracking-wide text-muted">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-2 opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-accent-2 animate-pulse-dot" />
      </span>
      {children}
    </span>
  );
}

export function GradientText({ children }: { children: ReactNode }) {
  return <span className="text-gradient">{children}</span>;
}

export function SectionHead({
  eyebrow,
  title,
  sub,
  center = true,
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: string;
  center?: boolean;
}) {
  return (
    <div className={`mb-12 md:mb-16 ${center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}`}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">{eyebrow}</p>
      <h2 className="text-3xl font-semibold leading-tight tracking-tight text-balance md:text-5xl">
        {title}
      </h2>
      {sub ? <p className="mt-4 text-base leading-relaxed text-muted md:text-lg">{sub}</p> : null}
    </div>
  );
}

export function PrimaryButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_40px_-8px_rgba(124,92,255,0.7)] transition-all hover:shadow-[0_0_50px_-4px_rgba(124,92,255,0.9)] hover:brightness-110 ${className}`}
    >
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative">{children}</span>
    </Link>
  );
}

export function GhostButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-line bg-white/5 px-7 py-3.5 text-sm font-semibold text-ink transition-colors hover:border-white/25 hover:bg-white/10 ${className}`}
    >
      {children}
    </Link>
  );
}

export function Section({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`py-20 md:py-28 ${className}`}>
      <div className="container-x">{children}</div>
    </section>
  );
}
