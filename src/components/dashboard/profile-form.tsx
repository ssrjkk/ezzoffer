"use client";

import { useState, type FormEvent } from "react";
import { Field, Panel, btnPrimary, inputCls } from "@/components/dashboard/ui";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [draft, setDraft] = useState({ name, email, password: "", currentPassword: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          email: draft.email,
          password: draft.password || undefined,
          currentPassword: draft.email !== email ? draft.currentPassword || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        return;
      }
      setDraft((d) => ({ ...d, password: "", currentPassword: "" }));
      setMessage({ ok: true, text: "Данные обновлены." });
    } catch {
      setMessage({ ok: false, text: "Сеть недоступна — данные не сохранены" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <h2 className="font-semibold tracking-tight">Профиль</h2>
      <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Имя">
          <input
            required
            maxLength={60}
            autoComplete="name"
            className={inputCls}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            required
            maxLength={100}
            autoComplete="email"
            className={inputCls}
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Новый пароль (оставьте пустым, если не меняете)">
            <input
              type="password"
              minLength={6}
              maxLength={100}
              autoComplete="new-password"
              className={inputCls}
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              placeholder="••••••••"
            />
          </Field>
        </div>
        {draft.email.trim().toLowerCase() !== email ? (
          <div className="md:col-span-2">
            <Field label="Текущий пароль (подтверждение смены email)">
              <input
                type="password"
                minLength={6}
                maxLength={100}
                autoComplete="current-password"
                className={inputCls}
                value={draft.currentPassword}
                onChange={(e) => setDraft({ ...draft, currentPassword: e.target.value })}
                placeholder="••••••••"
              />
            </Field>
          </div>
        ) : null}
        {message ? (
          <p className={`text-sm md:col-span-2 ${message.ok ? "text-success" : "text-red-300"}`}>{message.text}</p>
        ) : null}
        <div className="md:col-span-2">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "Сохраняем…" : "Сохранить изменения"}
          </button>
        </div>
      </form>
    </Panel>
  );
}