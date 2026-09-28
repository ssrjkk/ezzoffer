"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/dashboard/ui";

export function PlanBanner({
  active,
  trialStarted,
}: {
  active: boolean;
  trialStarted: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (active) return null;

  const startTrial = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trial", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Не удалось активировать пробный период");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-accent/30 bg-gradient-to-r from-accent/15 via-accent/5 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent">
          <svg viewBox="0 0 24 24" className="size-5" fill="none">
            <path d="M13 2 4.5 13.5h6L11 22l8.5-11.5h-6L13 2Z" fill="currentColor" />
          </svg>
        </span>
        <div>
          <p className="font-semibold">
            {trialStarted ? "Пробный период завершён" : "Запустите поиск прямо сейчас"}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {trialStarted
              ? "Продлите тариф или попробуйте снова — отклики, вакансии и статистика доступны после активации."
              : "24 часа бесплатно, 50 откликов в день, без привязки карты."}
          </p>
          {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
        </div>
      </div>
      {!trialStarted ? (
        <button
          type="button"
          onClick={startTrial}
          disabled={busy}
          className="inline-flex flex-none items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Активация…" : "Активировать бесплатно"}
        </button>
      ) : (
        <div>
          <Badge tone="warn">Ожидание тарифа</Badge>
        </div>
      )}
    </div>
  );
}

export function TodayLimitBar({ today, todayLimit }: { today: number; todayLimit: number }) {
  const pct = todayLimit > 0 ? Math.min(100, Math.round((today / todayLimit) * 100)) : 0;
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted">Откликов за сегодня</span>
        <span className="text-2xl font-semibold tabular-nums">
          {today}
          <span className="text-sm font-normal text-muted"> / {todayLimit}</span>
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full transition-all duration-700 ${pct >= 100 ? "bg-warn" : "bg-gradient-to-r from-accent to-accent-2"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        {pct >= 100 ? "Лимит исчерпан — сброс в полночь" : `Осталось ${todayLimit - today} откликов`}
      </p>
    </div>
  );
}