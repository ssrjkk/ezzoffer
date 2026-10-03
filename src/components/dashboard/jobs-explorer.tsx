"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Vacancy } from "@/lib/vacancies";
import { Badge, EmptyState, Field, Panel, btnPrimary, btnGhost, btnDanger, inputCls } from "@/components/dashboard/ui";

type Resume = { id: number; title: string; content: string; years_label: string; ai_improved: number };
type Letter = { id: number; title: string; content: string };
type Search = {
  id: number;
  title: string;
  keywords: string;
  salary_min: number | null;
  salary_max: number | null;
  format: string;
  city: string;
  level: string;
  company_blacklist: string;
  active: number;
  started_at: number | null;
  created_at: number;
  match_count: number;
};
type Application = { id: number; job_slug: string; external_url?: string | null; withdrawable?: boolean };
type Source = { source: string; label: string; available: boolean; count: number };

import { SOURCE_LABELS } from "@/lib/source-labels";

const emptySearch = {
  title: "",
  keywords: "",
  level: "" as string,
  format: "" as string,
  city: "",
  salaryMin: "",
  salaryMax: "",
  blacklist: "",
};

function parseSalary(text: string): number {
  const m = text.match(/от\s*([\d\s]+)/);
  return m ? parseInt(m[1].replace(/\s/g, ""), 10) || 0 : 0;
}

const AUTOREFRESH_KEY = "ez_jobs_autorefresh_at";
const AUTOREFRESH_MS = 10 * 60 * 1000;

export function JobExplorer() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [searches, setSearches] = useState<Search[]>([]);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [appliedId, setAppliedId] = useState(0);
  const [letterId, setLetterId] = useState(0);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [format, setFormat] = useState("");
  const [minSalary, setMinSalary] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptySearch);
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 20;
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [externalUrl, setExternalUrl] = useState<Record<string, string>>({});
  const [markingExternal, setMarkingExternal] = useState("");
  const [sendingEmail, setSendingEmail] = useState("");
  const vacanciesRef = useRef<Vacancy[]>([]);

  useEffect(() => {
    vacanciesRef.current = vacancies;
  }, [vacancies]);

  const loadVacancies = useCallback(
    async (withRefresh: boolean) => {
      setRefreshing(withRefresh);
      try {
        const url = withRefresh ? "/api/jobs?refresh=1" : "/api/jobs";
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          if (withRefresh) setError(data.error ?? "Не удалось обновить каталог");
          return;
        }
        if (Array.isArray(data.vacancies)) setVacancies(data.vacancies);
        if (Array.isArray(data.sources)) setSources(data.sources);
        if (withRefresh && data.refreshed) {
          setNotice(`Каталог обновлён: ${data.vacancies?.length ?? 0} вакансий`);
        }
      } catch {
        if (withRefresh) setError("Не удалось обновить каталог — попробуйте позже");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [r, l, s, a, jobs] = await Promise.all([
          fetch("/api/resumes").then((x) => x.json()),
          fetch("/api/letters").then((x) => x.json()),
          fetch("/api/searches").then((x) => x.json()),
          fetch("/api/applications").then((x) => x.json()),
          fetch("/api/jobs").then((x) => x.json()),
        ]);
        if (!alive) return;
        setResumes(r.resumes ?? []);
        setLetters(l.letters ?? []);
        setSearches(s.searches ?? []);
        setApplied(new Set((a.applications as Application[]).map((x) => x.job_slug)));
        setAppliedId((r.resumes?.[0]?.id as number) ?? 0);
        setLetterId((l.letters?.[0]?.id as number) ?? 0);
        if (Array.isArray(jobs.vacancies)) setVacancies(jobs.vacancies);
        if (Array.isArray(jobs.sources)) setSources(jobs.sources);
      } catch {
        if (alive) setError("Не удалось загрузить данные кабинета");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    const id = setInterval(() => {
      const hasExternal = vacanciesRef.current.some((v) => v.source !== "local");
      if (hasExternal) return;
      const last = Number(window.localStorage.getItem(AUTOREFRESH_KEY) ?? 0);
      if (Date.now() - last >= AUTOREFRESH_MS) {
        window.localStorage.setItem(AUTOREFRESH_KEY, String(Date.now()));
        try {
          fetch("/api/jobs?refresh=1", { cache: "no-store" })
            .then((x) => x.json())
            .then((data) => {
              if (Array.isArray(data.vacancies)) setVacancies(data.vacancies);
              if (Array.isArray(data.sources)) setSources(data.sources);
            })
            .catch(() => undefined);
        } catch {
          /* ignore */
        }
      }
    }, 60_000);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const min = Number(minSalary) || 0;
    return vacancies.filter((v) => {
      if (query && !`${v.title} ${v.company} ${v.category}`.toLowerCase().includes(query)) return false;
      if (level && v.level !== level) return false;
      if (format && v.format !== format) return false;
      const salary = v.salary_min ?? parseSalary(v.salary);
      if (min > 0 && salary > 0 && salary < min) return false;
      return true;
    });
  }, [vacancies, q, level, format, minSalary]);

  const apply = async (slug: string) => {
    setBusy(slug);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobSlug: slug, resumeId: appliedId || null, letterId: letterId || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось отправить отклик");
        return;
      }
      setApplied((prev) => new Set(prev).add(slug));
      setNotice(`Отклик отправлен: ${data.application?.job?.title ?? slug} — статус ведётся в разделе «Отклики».`);
    } finally {
      setBusy("");
    }
  };

  const markAsExternal = async (slug: string) => {
    setMarkingExternal(slug);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobSlug: slug, externalUrl: externalUrl[slug] || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось отметить отклик");
        return;
      }
      setApplied((prev) => new Set(prev).add(slug));
      setNotice(`Отклик отмечен: ${data.application?.job?.title ?? slug}`);
    } finally {
      setMarkingExternal("");
    }
  };

  const sendByEmail = async (slug: string) => {
    setSendingEmail(slug);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/applications/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobSlug: slug, resumeId: appliedId || null, letterId: letterId || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось отправить резюме по email");
        return;
      }
      setApplied((prev) => new Set(prev).add(slug));
      setNotice(data.note ?? "Резюме отправлено по email");
    } finally {
      setSendingEmail("");
    }
  };

  const toggleSearch = async (id: number, active: boolean) => {
    const res = await fetch(`/api/searches/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setSearches((prev) => prev.map((s) => (s.id === id ? (data.search as Search) : s)));
  };

  const removeSearch = async (id: number) => {
    const res = await fetch(`/api/searches/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setSearches((prev) => prev.filter((s) => s.id !== id));
  };

  const createSearch = async (e: FormEvent, autoRun: boolean) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          keywords: draft.keywords,
          level: draft.level,
          format: draft.format,
          city: draft.city,
          salary_min: draft.salaryMin ? Number(draft.salaryMin) : null,
          salary_max: draft.salaryMax ? Number(draft.salaryMax) : null,
          company_blacklist: draft.blacklist,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось создать поиск");
        return;
      }
      let search = data.search as Search;
      if (autoRun) {
        const act = await fetch(`/api/searches/${search.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true }),
        });
        const actData = await act.json();
        if (act.ok) search = actData.search as Search;
      }
      setSearches((prev) => [search, ...prev]);
      setDraft(emptySearch);
      setNotice(autoRun ? `Автопоиск «${search.title}» запущен — отклики начнут уходить.` : "Поиск сохранён. Нажмите «Запустить», чтобы активировать.");
    } finally {
      setCreating(false);
    }
  };

  const levelOptions = ["Intern", "Junior", "Middle", "Senior"];

  return (
    <div className="space-y-8">
      {error ? <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}
      {notice ? (
        <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{notice}</p>
      ) : null}

      <Panel>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold tracking-tight">Автопоиск</h2>
          {searches.length ? (
            <Badge tone="accent">{searches.filter((s) => s.active).length} активных</Badge>
          ) : null}
        </div>

        {searches.length ? (
          <div className="mb-5 space-y-2.5">
            {searches.map((s) => (
              <div key={s.id} className="flex flex-col gap-3 rounded-xl border border-line bg-white/[0.03] p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.title}</span>
                    <Badge tone={s.active ? "success" : "neutral"}>
                      <span className={`size-1.5 rounded-full ${s.active ? "bg-success" : "bg-muted"}`} />
                      {s.active ? "Работает" : "Пауза"}
                    </Badge>
                    <Badge tone="cyan">подходит {s.match_count} вакансий</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {[s.keywords && `ключи: ${s.keywords}`, s.level, s.format, s.city, s.salary_min && `от ${s.salary_min}`, s.salary_max && `до ${s.salary_max}`]
                      .filter(Boolean)
                      .join(" · ") || "Без фильтров"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className={s.active ? btnGhost : btnPrimary} onClick={() => toggleSearch(s.id, !s.active)}>
                    {s.active ? "Пауза" : `Запустить · ${s.match_count}`}
                  </button>
                  <button type="button" className={btnDanger} onClick={() => removeSearch(s.id)}>
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <form onSubmit={(e) => createSearch(e, true)} className="grid gap-4 md:grid-cols-2">
          <Field label="Название поиска">
            <input required maxLength={100} className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Например: Frontend Middle" />
          </Field>
          <Field label="Ключевые слова (через запятую)">
            <input maxLength={400} className={inputCls} value={draft.keywords} onChange={(e) => setDraft({ ...draft, keywords: e.target.value })} placeholder="react, typescript, next" />
          </Field>
          <Field label="Уровень">
            <select className={inputCls} value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value })}>
              <option value="">Любой</option>
              {levelOptions.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Формат">
            <select className={inputCls} value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value })}>
              <option value="">Любой</option>
              <option>Удалённо</option>
              <option>Гибрид</option>
              <option>В офисе</option>
            </select>
          </Field>
          <Field label="Город">
            <input maxLength={60} className={inputCls} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="Москва, Казань…" />
          </Field>
          <Field label="Зарплата, руб.">
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} type="number" value={draft.salaryMin} onChange={(e) => setDraft({ ...draft, salaryMin: e.target.value })} placeholder="от" />
              <input className={inputCls} type="number" value={draft.salaryMax} onChange={(e) => setDraft({ ...draft, salaryMax: e.target.value })} placeholder="до" />
            </div>
          </Field>
          <div className="md:col-span-2">
            <Field label="Исключить компании (через запятую)">
              <input className={inputCls} value={draft.blacklist} onChange={(e) => setDraft({ ...draft, blacklist: e.target.value })} placeholder="компания А, бренд Б" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button type="submit" disabled={creating} className={btnPrimary}>
              {creating ? "Создаём…" : "Создать и запустить"}
            </button>
            <button type="button" disabled={creating} className={btnGhost} onClick={(e) => createSearch(e as unknown as FormEvent, false)}>
              Сохранить без запуска
            </button>
          </div>
        </form>
      </Panel>

      <Panel>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold tracking-tight">Каталог вакансий</h2>
            <p className="mt-0.5 text-xs text-muted">
              {sources
                .map((src) => `${src.label} · ${src.count}`)
                .join("  ")}
            </p>
            {sources.some((src) => src.source === "hh" && !src.available) ? (
              <p className="mt-1 text-xs text-warn">
                Вакансии hh.ru отключены: задайте HH_ACCESS_TOKEN в окружении сервера.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={refreshing}
              onClick={() => loadVacancies(true)}
              className={`${btnGhost} shrink-0`}
            >
              {refreshing ? "Обновляем…" : "Обновить вакансии"}
            </button>
            <input className={`${inputCls} w-44`} placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className={`${inputCls} w-36`} value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">Уровень</option>
              {levelOptions.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <select className={`${inputCls} w-36`} value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="">Формат</option>
              <option>Удалённо</option>
              <option>Гибрид</option>
              <option>В офисе</option>
            </select>
            <input className={`${inputCls} w-32`} type="number" placeholder="от ₽" value={minSalary} onChange={(e) => setMinSalary(e.target.value)} />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-line pb-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Откликаться от имени:</span>
          <select className={`${inputCls} w-56`} value={appliedId} onChange={(e) => setAppliedId(Number(e.target.value))}>
            <option value={0}>Без резюме</option>
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
          <select className={`${inputCls} w-56`} value={letterId} onChange={(e) => setLetterId(Number(e.target.value))}>
            <option value={0}>Без письма</option>
            {letters.map((l) => (
              <option key={l.id} value={l.id}>{l.title}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-line bg-surface p-5">
                <div className="h-4 w-3/4 rounded bg-surface-2" />
                <div className="mt-2 h-3 w-1/2 rounded bg-surface-2" />
                <div className="mt-4 h-6 w-1/3 rounded bg-surface-2" />
                <div className="mt-2 h-3 w-full rounded bg-surface-2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Ничего не найдено" text="Попробуйте смягчить фильтры или нажмите «Обновить вакансии»." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {paginated.map((v) => (
              <div key={v.slug} className="flex flex-col gap-3 rounded-xl border border-line bg-white/[0.03] p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold leading-snug">{v.title}</h3>
                    <p className="mt-0.5 text-sm text-muted">{v.company} · {v.city}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={applied.has(v.slug) ? "success" : "neutral"}>
                      {applied.has(v.slug) ? "Отклик отправлен" : v.level}
                    </Badge>
                    <Badge tone={v.source === "local" ? "neutral" : "cyan"}>
                      {SOURCE_LABELS[v.source] ?? v.source}
                    </Badge>
                  </div>
                </div>
                <p className="text-lg font-semibold text-accent-2">{v.salary}</p>
                <p className="line-clamp-2 text-sm text-muted">{v.about}</p>
                <div className="mt-auto flex flex-wrap gap-1.5">
                  <Badge>{v.format}</Badge>
                  <Badge>{v.category}</Badge>
                </div>
                <div className="mt-1 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy === v.slug || applied.has(v.slug)}
                      onClick={() => apply(v.slug)}
                      className={applied.has(v.slug) ? `${btnGhost} flex-1 disabled:opacity-60` : `${btnPrimary} flex-1`}
                    >
                      {busy === v.slug ? "Отправляем…" : applied.has(v.slug) ? "Уже откликнулись" : "Откликнуться сейчас"}
                    </button>
                    {v.contact_email ? (
                      <button
                        type="button"
                        disabled={sendingEmail === v.slug || applied.has(v.slug)}
                        onClick={() => sendByEmail(v.slug)}
                        title={`Отправить резюме на ${v.contact_email}`}
                        className={`${btnGhost} shrink-0`}
                      >
                        {sendingEmail === v.slug ? "Отправляем…" : "📧 По email"}
                      </button>
                    ) : null}
                    {v.source_url ? (
                      <a
                        href={v.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${btnGhost} shrink-0`}
                      >
                        На сайте
                      </a>
                    ) : null}
                  </div>
                  {!applied.has(v.slug) && v.source !== "hh" ? (
                    <div className="flex gap-2">
                      <input
                        className={`${inputCls} flex-1`}
                        placeholder="Ссылка на отклик (необязательно)"
                        value={externalUrl[v.slug] ?? ""}
                        onChange={(e) => setExternalUrl((prev) => ({ ...prev, [v.slug]: e.target.value }))}
                      />
                      <button
                        type="button"
                        disabled={markingExternal === v.slug}
                        onClick={() => markAsExternal(v.slug)}
                        className={`${btnGhost} shrink-0`}
                      >
                        {markingExternal === v.slug ? "Отмечаем…" : "Отметить отклик"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className={btnGhost}
            >
              Назад
            </button>
            <span className="text-sm text-muted">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className={btnGhost}
            >
              Вперёд
            </button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}