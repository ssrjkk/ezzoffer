import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { articles } from "@/lib/data";

export function BlogPreview() {
  const preview = articles.slice(0, 3);

  return (
    <section className="container-x py-20 md:py-28">
      <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">
            Полезная информация
          </p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-balance md:text-5xl">
            Статьи и советы о <span className="text-gradient">поиске работы</span>
          </h2>
        </div>
        <Link
          href="/blog"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-ink"
        >
          Все статьи
          <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {preview.map((article, idx) => (
          <Reveal key={article.slug} delay={idx * 80}>
            <Link
              href={`/blog/${article.slug}`}
              className="group flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface/60 transition-all duration-300 hover:-translate-y-1 hover:border-white/20"
            >
              <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-accent/15 via-surface-2 to-accent-2/15">
                <div className="pointer-events-none absolute inset-0 bg-grid opacity-50" />
                <span className="relative grid size-16 place-items-center rounded-2xl bg-bg/70 text-3xl shadow-inner ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                  <svg viewBox="0 0 24 24" className="size-8 text-accent-2" fill="none">
                    <path d="M12 3 4 9v12h16V9l-8-6ZM9 21v-8h6v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span className="rounded-full bg-accent/15 px-2.5 py-1 font-medium text-accent-2">
                    {article.category}
                  </span>
                  <span>{article.minutes} мин</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold leading-snug tracking-tight transition-colors group-hover:text-gradient">
                  {article.title}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{article.excerpt}</p>
                <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-sm">
                  <span className="text-muted">{article.date}</span>
                  <span className="font-semibold text-accent-2">Читать →</span>
                </div>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}