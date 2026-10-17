"use client";

import { useState } from "react";
import { Badge, Panel, btnGhost } from "@/components/dashboard/ui";
import type { MethodId } from "@/lib/payments/types";

/**
 * Оплата тарифа.
 *
 * Способ выбирает человек, но выбор не равносилен оплате: кнопка «Оплатить»
 * запрашивает счёт у сервера и показывает, куда платить. Пока способ не
 * готов — сервер без ключей, крипта без кошелька — он показан недоступным
 * с причиной, а не просто спрятан: отсутствие кнопки человек читает как
 * «здесь нельзя заплатить» и уходит.
 *
 * Тарифы с ценой 0 (бета) не оплачиваются вовсе: у них есть кнопка
 * «Получить», которая вызывает тот же /activate без денег.
 */

type Method = { id: MethodId; title: string; ready: boolean; reason?: string | null };
type Item = {
  id: string;
  title: string;
  priceRub: number;
  days: number;
  lifetime: boolean;
  permanent: boolean;
  features: string[];
};

export function PlansGrid({
  items,
  methods,
  currentPlan,
}: {
  items: Item[];
  methods: Method[];
  currentPlan: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [method, setMethod] = useState<string>(methods[0]?.id ?? "card");

  const chosen = methods.find((m) => m.id === method);

  const start = async (plan: Item) => {
    setBusy(plan.id);
    setMessage(null);
    try {
      const isFree = plan.priceRub <= 0;
      const url = isFree
        ? `/api/plans/activate?planId=${encodeURIComponent(plan.id)}`
        : `/api/plans/checkout?planId=${encodeURIComponent(plan.id)}&method=${encodeURIComponent(method)}`;
      const res = await fetch(url, { method: isFree ? "POST" : "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Не удалось оформить");
        return;
      }
      if (data.payUrl || data.address) {
        setMessage(
          `Счёт создан.${data.address ? ` Адрес: ${data.address}` : ""}${
            data.invoiceId ? ` Счёт №${data.invoiceId}.` : ""
          }`,
        );
      } else {
        setMessage(data.error ?? "Готово");
      }
    } catch {
      setMessage("Не удалось оформить: нет связи с сервером");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((plan) => {
          const current = currentPlan === plan.id;
          return (
            <Panel key={plan.id}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-serif text-lg leading-snug text-ink">{plan.title}</h2>
                {current && <Badge tone="success">ваш тариф</Badge>}
                {plan.lifetime && !current && <Badge tone="accent">без срока</Badge>}
              </div>

              <p className="mt-2 font-serif text-2xl text-ink">
                {plan.priceRub <= 0 ? "0 ₽" : `${plan.priceRub} ₽`}
              </p>
              <p className="text-xs text-muted">
                {plan.permanent
                  ? "Навсегда, пока продукт в бете"
                  : plan.priceRub <= 0
                    ? "бета-период"
                    : `на ${plan.days} дней`}
              </p>

              <ul className="mt-3 space-y-1 text-sm text-muted">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>

              <button
                type="button"
                disabled={busy === plan.id || current}
                onClick={() => void start(plan)}
                className={`mt-4 w-full ${btnGhost}`}
              >
                {current
                  ? "Подключено"
                  : busy === plan.id
                    ? "Оформляем…"
                    : plan.priceRub <= 0
                      ? "Получить"
                      : "Оплатить"}
              </button>
            </Panel>
          );
        })}
      </div>

      {/*
        Способы оплаты — только если есть платный тариф. Иначе они занимают
        место и предлагают то, что сейчас не нужно.
      */}
      {items.some((p) => p.priceRub > 0) && (
        <div className="mt-6">
          <h3 className="font-serif text-base text-ink">Способ оплаты</h3>
          <ul className="mt-2 space-y-2">
            {methods.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  id={`pay-${m.id}`}
                  name="pay-method"
                  checked={method === m.id}
                  disabled={!m.ready}
                  onChange={() => setMethod(m.id)}
                />
                <label htmlFor={`pay-${m.id}`} className={m.ready ? "text-ink" : "text-muted"}>
                  {m.title}
                </label>
                {!m.ready && m.reason && <span className="text-xs text-warn">{m.reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p role="alert" className={message ? "mt-4 text-sm text-muted" : "sr-only"}>
        {message ?? ""}
      </p>

      {chosen && !chosen.ready && chosen.reason && (
        <p className="mt-2 text-xs text-muted">
          Выбранный способ пока недоступен: {chosen.reason}. Подписка включится, как только
          администратор настроит оплату.
        </p>
      )}
    </div>
  );
}