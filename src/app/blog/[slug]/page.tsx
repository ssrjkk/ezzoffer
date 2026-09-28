import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { articles } from "@/lib/data";
import { JsonLd } from "@/components/json-ld";

const siteUrl = process.env.SITE_URL ?? "https://ezoffer.ru";

const nowIso = new Date().toISOString();

export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  if (!article) return { title: "Статья не найдена" };
  return { title: article.title, description: article.excerpt };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  if (!article) notFound();

  const related = articles.filter((a) => a.slug !== article.slug).slice(0, 3);

  return (
    <div className="container-x py-12 md:py-16">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.title,
          description: article.excerpt,
          datePublished: nowIso,
          inLanguage: "ru-RU",
          author: { "@type": "Organization", name: "EZOffer", url: siteUrl },
          publisher: { "@type": "Organization", name: "EZOffer", url: siteUrl, logo: `${siteUrl}/icon.svg` },
        }}
      />
      <Link
        href="/blog"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <span aria-hidden>←</span> Все статьи
      </Link>

      <article className="mx-auto mt-8 max-w-3xl">
        <header>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="rounded-full bg-accent/15 px-2.5 py-1 font-medium text-accent-2">
              {article.category}
            </span>
            <span>{article.minutes} мин чтения</span>
            <span>{article.date}</span>
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-balance md:text-5xl">
            {article.title}
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted md:text-lg">
            {article.excerpt}
          </p>
        </header>

        <div className="mt-12 space-y-12">
          {article.body.map((block) => (
            <section key={block.h}>
              <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{block.h}</h2>
              <div className="mt-4 space-y-4">
                {block.p.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)} className="text-base leading-relaxed text-ink/85">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 rounded-3xl border border-accent/40 bg-gradient-to-b from-accent/15 to-surface/60 p-8 text-center md:p-10">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
            Хватит делать это вручную
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted">
            EZOffer улучшает резюме, подбирает вакансии и отправляет до 100 персональных
            откликов в день. Пробный период 24 часа без карты.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_36px_-8px_rgba(124,92,255,0.8)] transition hover:brightness-110"
          >
            Попробовать бесплатно
          </Link>
        </div>
      </article>

      <div className="mx-auto mt-16 max-w-3xl">
        <h2 className="mb-5 text-lg font-semibold tracking-tight">Читайте также</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {related.map((r) => (
            <Link
              key={r.slug}
              href={`/blog/${r.slug}`}
              className="group rounded-2xl border border-line bg-surface/60 p-5 transition-colors hover:border-white/20"
            >
              <p className="text-xs text-accent-2">{r.category} · {r.minutes} мин</p>
              <p className="mt-2 text-sm font-semibold leading-snug transition-colors group-hover:text-gradient">
                {r.title}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}