"use client";

import { useState, type FormEvent } from "react";
import { ScoreBadge } from "./score-badge";
import { Badge, EmptyState, Field, btnPrimary, btnGhost, btnDanger, inputCls } from "@/components/dashboard/ui";

type Resume = {
  id: number;
  title: string;
  content: string;
  years_label: string;
  ai_improved: number;
  updated_at: number;
};

type Draft = { id: number | null; title: string; years_label: string; content: string };

const emptyDraft: Draft = { id: null, title: "", years_label: "", content: "" };

export function ResumesManager({ initial }: { initial: Resume[] }) {
  const [resumes, setResumes] = useState<Resume[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [improvingId, setImprovingId] = useState<number | null>(null);
  const [improveResult, setImproveResult] = useState<{
    resume: Resume;
    notes: string[];
    tips: string[];
    keywords: string[];
    score: { before: number; after: number };
  } | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(draft.id ? `/api/resumes/${draft.id}` : "/api/resumes", {
        method: draft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось сохранить резюме");
        return;
      }
      const saved = data.resume as Resume;
      setResumes((prev) =>
        draft.id
          ? prev.map((r) => (r.id === saved.id ? saved : r))
          : [saved, ...prev],
      );
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    const res = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setResumes((prev) => prev.filter((r) => r.id !== id));
  };

  const improve = async (id: number) => {
    setImprovingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/resumes/${id}/improve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось улучшить резюме");
        return;
      }
      setResumes((prev) => prev.map((r) => (r.id === id ? (data.resume as Resume) : r)));
      setImproveResult(data);
    } finally {
      setImprovingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button type="button" className={btnPrimary} onClick={() => { setDraft(emptyDraft); setImproveResult(null); }}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Создать резюме
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>
      ) : null}

      {improveResult ? (
        <div className="glass space-y-4 rounded-2xl border border-accent/30 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Резюме улучшено с AI</h3>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">ATS-скоринг</span>
              <span className="font-semibold text-muted line-through">{improveResult.score.before}</span>
              <span className="text-accent-2">→</span>
              <span className="text-lg font-bold text-success">{improveResult.score.after}</span>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Что сделано</p>
              <ul className="space-y-1.5 text-sm">
                {improveResult.notes.map((n) => (
                  <li key={n} className="flex gap-2">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-success" />
                    {n}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Советы</p>
              <ul className="space-y-1.5 text-sm text-muted">
                {improveResult.tips.map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent-2" />
                    {t}
                  </li>
                ))}
              </ul>
              {improveResult.keywords.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {improveResult.keywords.map((k) => (
                    <Badge key={k} tone="cyan">{k}</Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {resumes.length === 0 ? (
        <EmptyState
          title="Пока нет резюме"
          text="Создайте первое резюме — AI подскажет ключевые навыки и усилит его под вакансии."
        />
      ) : (
        <div className="space-y-3">
          {resumes.map((r) => (
            <div key={r.id} className="glass flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{r.title}</h3>
                  {r.ai_improved ? <Badge tone="success">Улучшено AI</Badge> : <Badge>Черновик</Badge>}
                  <ScoreBadge content={r.content} />
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{r.content.split("\n").slice(0, 4).join(" · ")}</p>
                <p className="mt-2 text-xs text-muted">
                  {r.years_label ? `${r.years_label} · ` : ""}
                  Обновлено {new Date(r.updated_at).toLocaleDateString("ru-RU")}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={improvingId === r.id}
                  className={btnGhost}
                  onClick={() => improve(r.id)}
                >
                  {improvingId === r.id ? "Усиляем…" : "Улучшить с AI"}
                </button>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => { setDraft({ id: r.id, title: r.title, years_label: r.years_label, content: r.content }); setImproveResult(null); }}
                >
                  Редактировать
                </button>
                <button type="button" className={btnDanger} onClick={() => remove(r.id)}>
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDraft(null)} />
          <form onSubmit={save} className="relative w-full max-w-2xl space-y-4 rounded-3xl border border-line bg-surface p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">
                {draft.id ? "Редактировать резюме" : "Новое резюме"}
              </h2>
              <button type="button" onClick={() => setDraft(null)} className="grid size-8 place-items-center rounded-lg border border-line text-muted hover:text-ink" aria-label="Закрыть">
                <svg viewBox="0 0 24 24" className="size-4" fill="none">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <Field label="Название">
              <input
                required
                maxLength={100}
                className={inputCls}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Например: Frontend-разработчик, 3 года"
              />
            </Field>
            <Field label="Опыт (кратко)">
              <input
                maxLength={60}
                className={inputCls}
                value={draft.years_label}
                onChange={(e) => setDraft({ ...draft, years_label: e.target.value })}
                placeholder="Например: 3 года · Middle"
              />
            </Field>
            <Field label="Текст резюме">
              <textarea
                required
                maxLength={20000}
                rows={14}
                className={`${inputCls} min-h-56 resize-y font-mono text-[13px] leading-relaxed`}
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                placeholder={"Опыт работы:\n- ...\n\nОбразование:\n- ..."}
              />
            </Field>
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => setDraft(null)}>
                Отмена
              </button>
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? "Сохраняем…" : "Сохранить"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}