"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Panel, btnPrimary, btnGhost } from "@/components/dashboard/ui";

export function AutoApplyPause({ initialPaused }: { initialPaused: boolean }) {
  const [paused, setPaused] = useState(initialPaused);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/autoapply/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { paused: boolean }) => {
        if (alive) setPaused(Boolean(data.paused));
      })
      .catch(() => undefined)
      .finally(() => {
        alive = false;
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(paused ? "/api/autoapply/resume" : "/api/autoapply/pause", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось переключить");
        return;
      }
      setPaused(Boolean(data.paused));
    } catch {
      setError("Не удалось переключить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold tracking-tight">Автоотклики</h2>
          <p className="mt-1 text-sm text-muted">
            Пауза мгновенно останавливает все автоотклики и активные поиски. Настройки сохраняются.
          </p>
        </div>
        <Badge tone={paused ? "warn" : "success"}>{paused ? "На паузе" : "Активны"}</Badge>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={toggle} className={paused ? btnPrimary : btnGhost}>
          {busy ? "Сохраняем…" : paused ? "Возобновить автоотклики" : "Поставить на паузу"}
        </button>
        <Link
          href="/platform-rules"
          className="text-sm font-medium text-accent-2 underline-offset-2 transition-colors hover:underline"
        >
          Правила платформ и риски
        </Link>
      </div>
    </Panel>
  );
}