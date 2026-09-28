"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Panel, btnPrimary, btnGhost } from "@/components/dashboard/ui";

type LinkResponse = {
  code?: string;
  bot?: string;
  expires_in?: number;
  error?: string;
};

export function TelegramConnect() {
  const [status, setStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState<LinkResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data as { configured: boolean; connected: boolean });
    } catch {
      setError("Не удалось проверить статус Telegram");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/telegram/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { configured: boolean; connected: boolean }) => {
        if (alive) setStatus(data);
      })
      .catch(() => {
        if (alive) setError("Не удалось проверить статус Telegram");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const generateCode = async () => {
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const res = await fetch("/api/telegram/link", { cache: "no-store" });
      const data = (await res.json()) as LinkResponse;
      if (!res.ok || !data.code) {
        setError(data.error ?? "Telegram недоступен");
        return;
      }
      setLink(data);
    } catch {
      setError("Не удалось сгенерировать код");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/disconnect", { method: "POST" });
      if (!res.ok) return;
      await load();
    } catch {
      setError("Не удалось отключить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold tracking-tight">Telegram-бот</h2>
          <p className="mt-1 text-sm text-muted">
            Получайте статистику и дневные отчёты в Telegram, управляйте откликами из чата.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading ? (
            <Badge tone="neutral">Проверка…</Badge>
          ) : status?.connected ? (
            <Badge tone="success">Подключён</Badge>
          ) : status && !status.configured ? (
            <Badge tone="warn">Не настроено на сервере</Badge>
          ) : (
            <Badge tone="neutral">Не подключён</Badge>
          )}
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>
      ) : null}

      {!loading && status && (
        <div className="mt-4">
          {status.connected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">Команды бота: /status — статистика, /digest — дневной отчёт, /unlink — отвязать.</p>
              <button type="button" disabled={busy} onClick={unlink} className={btnGhost}>
                {busy ? "Отключаем…" : "Отключить Telegram"}
              </button>
            </div>
          ) : status.configured ? (
            <div className="space-y-3">
              {!link ? (
                <button type="button" disabled={busy} onClick={generateCode} className={btnPrimary}>
                  {busy ? "Генерируем…" : "Подключить Telegram"}
                </button>
              ) : (
                <div className="space-y-2 rounded-2xl border border-line bg-white/[0.03] p-4">
                  <p className="text-sm text-muted">
                    Откройте бота{" "}
                    <span className="font-semibold text-ink">{link.bot ? `@${link.bot}` : "в Telegram"}</span> и отправьте
                    команду:
                  </p>
                  <p className="rounded-xl bg-black/20 px-4 py-3 font-mono text-sm">
                    /link {link.code}
                  </p>
                  <p className="text-xs text-muted">Код действителен {Math.round((link.expires_in ?? 0) / 60)} минут.</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Администратор не настроил Telegram-бота (нужен TELEGRAM_BOT_TOKEN).
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}