import Link from "next/link";
import { Section, SectionHead, PrimaryButton } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { reviews } from "@/lib/data";

function Stars({ count }: { count: number }) {
  return (
    <span className="text-sm text-warn" aria-label={`${count} из 5`}>
      {"★".repeat(count)}
      {"☆".repeat(5 - count)}
    </span>
  );
}

export function ReviewsPreview() {
  const preview = reviews.slice(0, 9);

  return (
    <Section>
      <SectionHead
        eyebrow="Отзывы клиентов"
        title={
          <>
            Нам доверяют <span className="text-gradient">сотни клиентов</span>
          </>
        }
        sub="Средняя оценка 4.9 — вот что говорят те, кто уже получил оффер"
      />

      <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5">
        {preview.map((review, idx) => (
          <Reveal key={review.name} delay={(idx % 3) * 70} className="break-inside-avoid">
            <figure className="rounded-3xl border border-line bg-surface/70 p-6 transition-colors hover:border-white/20">
              <div className="flex items-center justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-accent/40 to-accent-2/30 text-xs font-bold">
                  {review.initials}
                </span>
                <Stars count={review.rating} />
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink/85">{review.text}</p>
              <figcaption className="mt-5 border-t border-line pt-4">
                <p className="text-sm font-semibold">{review.name}</p>
                <p className="text-xs text-muted">{review.role}</p>
                <p className="mt-1 text-xs font-medium text-success">{review.result}</p>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-4">
        <PrimaryButton href="/reviews">Смотреть все отзывы</PrimaryButton>
        <Link href="/#tariff" className="text-sm text-muted transition-colors hover:text-ink">
          Перейти к тарифам →
        </Link>
      </div>
    </Section>
  );
}