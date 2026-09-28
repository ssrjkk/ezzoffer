import type { Metadata } from "next";
import Link from "next/link";
import { articles } from "@/lib/data";

export const metadata: Metadata = {
  title: "Блог",
  description: "Статьи и советы о поиске работы: автоотклики, резюме, ATS, сопроводительные письма и карьерные стратегии.",
};

export default function BlogPage() {
  return (
    <div className="container-x py-14 md:py-20">
      <div className="max-w-3xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">
          Блог
        </p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-balance md:text-5xl">
          Статьи о том, как находить работу <span className="text-gradient">быстрее</span>
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted md:text-lg">
          Разборы, гайды и данные о рынке — без воды и «ловушек успешного успеха».
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <Link
            key={article.slug}
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
                <span>{article.date}</span>
              </div>
              <h2 className="mt-4 text-lg font-semibold leading-snug tracking-tight transition-colors group-hover:text-gradient">
                {article.title}
              </h2>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{article.excerpt}</p>
              <span className="mt-5 inline-flex items-center gap-2 border-t border-line pt-4 text-sm font-semibold text-accent-2">
                Читать статью
                <span aria-hidden>→</span>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}