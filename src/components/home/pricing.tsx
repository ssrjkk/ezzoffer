"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Section, SectionHead } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { plans, type PlanPeriod } from "@/lib/data";

const PLAN_IDS = ["start", "pro", "expert"];

const periods: { days: PlanPeriod; label: string }[] = [
  { days: 7, label: "7 дней" },
  { days: 14, label: "14 дней" },
  { days: 30, label: "30 дней" },
];

export function PricingSection({ compact = false }: { compact?: boolean }) {
  const [period, setPeriod] = useState<PlanPeriod>(14);
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setHasAccount(Boolean(d?.user)))
      .catch(() => setHasAccount(false));
  }, []);

  const choose = async (planId: string) => {
    setNotice(null);
    if (!hasAccount) {
      router.push("/signup");
      return;
    }
    setBusy(planId);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, period }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? "Не удалось активировать тариф");
        return;
      }
      router.push("/dashboard/settings");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section id={compact ? undefined : "tariff"} className={compact ? "border-t border-line bg-surface/40" : "relative border-y border-line bg-surface/40"}>
      <SectionHead
        eyebrow="Подписочная модель"
        title={
          <>
            Тариф, который <span className="text-gradient">окупается на первом оффере</span>
          </>
        }
        sub="Попробуйте весь функционал бесплатно и выберите подходящий период"
      />

      <div className="mb-10 flex justify-center">
        <div className="glass inline-flex rounded-full p-1">
          {periods.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setPeriod(p.days)}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
                period === p.days
                  ? "bg-accent text-white shadow-[0_0_24px_-6px_rgba(124,92,255,0.8)]"
                  : "text-muted hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {notice ? (
        <p className="mx-auto mb-6 max-w-md rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-center text-sm text-red-300">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan, idx) => (
          <Reveal key={plan.name} delay={idx * 90}>
            <article
              className={`relative flex h-full flex-col rounded-3xl border p-7 transition-all duration-300 md:p-8 ${
                plan.popular
                  ? "border-accent/60 bg-gradient-to-b from-accent/15 to-surface/60 shadow-[0_0_70px_-18px_rgba(124,92,255,0.6)]"
                  : "border-line bg-surface/60 hover:border-white/20"
              }`}
            >
              {plan.popular ? (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-white shadow-lg">
                  Популярный выбор
                </span>
              ) : null}

              <p className="text-sm font-semibold uppercase tracking-widest text-accent-2">
                {plan.name}
              </p>
              <p className="mt-1.5 text-sm text-muted">{plan.tagline}</p>

              <div className="mt-6 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-tight md:text-5xl">
                  {plan.prices[period].toLocaleString("ru-RU")} ₽
                </span>
                <span className="pb-1.5 text-sm text-muted">
                  за {period} дней
                </span>
              </div>

              <ul className="mt-7 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                      <svg viewBox="0 0 24 24" className="size-3.5" fill="none">
                        <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="leading-relaxed text-ink/90">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={busy === PLAN_IDS[idx]}
                onClick={() => choose(PLAN_IDS[idx])}
                className={`mt-8 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition-all ${
                  plan.popular
                    ? "bg-accent text-white shadow-[0_0_40px_-8px_rgba(124,92,255,0.8)] hover:brightness-110"
                    : "border border-line bg-white/5 text-ink hover:bg-white/10"
                }`}
              >
                {busy === PLAN_IDS[idx] ? "Активируем…" : hasAccount ? "Выбрать тариф" : plan.cta}
              </button>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal delay={100}>
        <p className="mt-8 text-center text-xs text-muted">
          {hasAccount ? (
            "Тариф активируется мгновенно без оплаты — демо-режим. Затем он откроется в кабинете."
          ) : (
            <>
              Приобретая тариф, вы соглашаетесь с{" "}
              <Link href="/faq" className="underline decoration-line underline-offset-2 hover:text-ink">
                условиями сервиса
              </Link>
              . Авторизуйтесь, чтобы активировать тариф.
            </>
          )}
        </p>
      </Reveal>
    </Section>
  );
}