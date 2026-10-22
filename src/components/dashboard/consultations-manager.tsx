'use client';

import { useState, type FormEvent } from 'react';
import { formatShortDateTime } from '@/lib/format-date';
import {
  Badge,
  EmptyState,
  Field,
  Panel,
  btnPrimary,
  inputCls,
  StatusMessage,
} from '@/components/dashboard/ui';

type Consultation = { id: number; theme: string; note: string; booked_at: number; done: number };

const THEMES = [
  'Разбор резюме',
  'Стратегия поиска работы',
  'Подготовка к собеседованию',
  'Анализ отказов и воронки',
  'Оценка оффера',
  'Другое',
];

const themeHint: Record<string, string> = {
  'Разбор резюме': 'Человек посмотрит структуру, навыки и цифры и подскажет правки.',
  'Стратегия поиска работы':
    'Выстроим план на ближайшие недели: какие вакансии, сколько откликов в день и на что делать акцент.',
  'Подготовка к собеседованию': 'Потренируем ответы на вопросы и разберём типичные ловушки HR.',
  'Анализ отказов и воронки':
    'Посмотрим вашу статистику в кабинете и найдём точку роста конверсии.',
  'Оценка оффера': 'Сравним условия и поможем принять взвешенное решение.',
};

export function ConsultationsManager({ initial }: { initial: Consultation[] }) {
  const [items, setItems] = useState<Consultation[]>(initial);
  const [theme, setTheme] = useState(THEMES[0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<number | null>(null);

  const markDone = async (id: number) => {
    setMarkingId(id);
    try {
      const res = await fetch('/api/consultations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, done: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Не удалось обновить заявку');
        return;
      }
      setItems((prev) => prev.map((c) => (c.id === id ? { ...c, done: 1 } : c)));
    } catch {
      setError('Сеть недоступна — отметка не сохранена');
    } finally {
      setMarkingId(null);
    }
  };

  const book = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Не удалось записаться');
        return;
      }
      setItems((prev) => [data.consultation, ...prev]);
      setNote('');
      setNotice('Заявка принята. Отвечаем вручную — обычно в течение пары дней, не мгновенно.');
    } catch {
      setError('Сеть недоступна — заявка не отправлена');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Panel className="lg:col-span-2">
        <h2 className="font-serif text-lg leading-snug text-ink">Записаться</h2>
        <form onSubmit={book} className="mt-5 space-y-4">
          <Field label="Тема">
            <select
              className={`${inputCls} w-full`}
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          {themeHint[theme] ? (
            <p className="text-xs leading-relaxed text-muted">{themeHint[theme]}</p>
          ) : null}
          <Field label="Комментарий">
            <textarea
              rows={4}
              className={`${inputCls} w-full resize-y`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="О себе, ссылка на резюме, цель…"
            />
          </Field>
          <StatusMessage tone="error">{error}</StatusMessage>
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {busy ? 'Отправляем…' : 'Записаться на консультацию'}
          </button>
          <StatusMessage tone="success">{notice}</StatusMessage>
        </form>
      </Panel>

      <div className="space-y-3 lg:col-span-3">
        <p className="text-sm text-muted">
          {items.length ? `Заявок: ${items.length}` : 'Заявок пока нет'}
        </p>
        {items.length === 0 ? (
          <EmptyState
            title="Записей нет"
            text="Выберите тему слева и оставьте заявку. Пока услуга бесплатна для всех: отвечает человек вручную, обычно в течение пары дней."
          />
        ) : (
          items.map((c) => (
            <div key={c.id} className=" flex flex-col gap-2 rounded-sm p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-serif leading-snug text-ink">{c.theme}</h3>
                <Badge tone={c.done ? 'success' : 'accent'}>
                  {c.done ? 'Проведена' : 'Ожидание'}
                </Badge>
              </div>
              {c.note ? <p className="text-sm text-muted">{c.note}</p> : null}
              <p className="text-xs text-muted">Заявка от {formatShortDateTime(c.booked_at)}</p>
              {!c.done ? (
                <div>
                  <button
                    type="button"
                    disabled={markingId === c.id}
                    onClick={() => void markDone(c.id)}
                    className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-accent underline-offset-4 hover:underline disabled:opacity-60"
                  >
                    {markingId === c.id ? 'Сохраняем…' : 'Отметить проведённой'}
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
