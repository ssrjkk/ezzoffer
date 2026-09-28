"use client";

import { useState, type FormEvent } from "react";
import { Badge, EmptyState, Field, btnPrimary, btnGhost, btnDanger, inputCls } from "@/components/dashboard/ui";

type Letter = { id: number; title: string; content: string; updated_at: number };
type Draft = { id: number | null; title: string; content: string };

const emptyDraft: Draft = { id: null, title: "", content: "" };

export function LettersManager({ initial }: { initial: Letter[] }) {
  const [letters, setLetters] = useState<Letter[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(draft.id ? `/api/letters/${draft.id}` : "/api/letters", {
        method: draft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title, content: draft.content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось сохранить письмо");
        return;
      }
      const saved = data.letter as Letter;
      setLetters((prev) => (draft.id ? prev.map((l) => (l.id === saved.id ? saved : l)) : [saved, ...prev]));
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    const res = await fetch(`/api/letters/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setLetters((prev) => prev.filter((l) => l.id !== id));
  };

  const fillTemplate = () => {
    setDraft((d) =>
      d
        ? {
            ...d,
            content:
              "Здравствуйте!\n\nМеня заинтересовала вакансия {вакансия} в компании {компания}. Мой опыт полностью соответствует требованиям: {ключевые навыки}. В последней роли я {достижение с цифрой}.\n\nБуду рад обсудить детали на собеседовании. Резюме прикрепляю.\n\nС уважением, {имя}",
          }
        : d,
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button type="button" className={btnPrimary} onClick={() => { setDraft(emptyDraft); }}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Создать письмо
        </button>
      </div>

      {error ? <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}

      {letters.length === 0 ? (
        <EmptyState
          title="Писем пока нет"
          text="Создайте шаблон сопроводительного письма — AI подставит ключевые навыки и достижения в каждый отклик."
        />
      ) : (
        <div className="space-y-3">
          {letters.map((l) => (
            <div key={l.id} className="glass flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{l.title}</h3>
                  <Badge>{l.content.length} симв.</Badge>
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted">{l.content}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => { setDraft({ id: l.id, title: l.title, content: l.content }); }}
                >
                  Редактировать
                </button>
                <button type="button" className={btnDanger} onClick={() => remove(l.id)}>
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
              <h2 className="text-xl font-semibold tracking-tight">{draft.id ? "Редактировать письмо" : "Новое письмо"}</h2>
              <button type="button" onClick={() => setDraft(null)} className="grid size-8 place-items-center rounded-lg border border-line text-muted hover:text-ink" aria-label="Закрыть">
                <svg viewBox="0 0 24 24" className="size-4" fill="none">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {!draft.id ? (
              <button type="button" onClick={fillTemplate} className={btnGhost}>
                Заполнить шаблон
              </button>
            ) : null}
            <Field label="Название">
              <input required maxLength={100} className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Например: Стандартное письмо" />
            </Field>
            <Field label="Текст письма">
              <textarea
                required
                maxLength={20000}
                rows={9}
                className={`${inputCls} min-h-44 resize-y leading-relaxed`}
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                placeholder="Здравствуйте!..."
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => setDraft(null)}>Отмена</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? "Сохраняем…" : "Сохранить"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}