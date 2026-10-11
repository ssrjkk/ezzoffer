import { Reveal } from "@/components/reveal";
import { reviews } from "@/lib/data";

/*
 * Отзывы.
 *
 * Прежняя версия — masonry из одинаковых карточек с градиентными кружками
 * инициалов. Кружки ничем не различались и просто занимали место.
 *
 * Теперь — врезки: инициалы моноширинным без подложки, оценка цифрой,
 * результат отделён линейкой и набран акцентом. Цитата читается как
 * цитата, а не как карточка товара.
 */

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-baseline gap-2">
      <span aria-hidden className="text-warn">
        {"★".repeat(rating)}
        {"☆".repeat(5 - rating)}
      </span>
      <span className="font-mono text-xs tabular-nums text-muted">
        {rating.toFixed(1)}
      </span>
      <span className="sr-only">{rating} из 5</span>
    </span>
  );
}

export function ReviewsList({ limit }: { limit?: number }) {
  const shown = typeof limit === "number" ? reviews.slice(0, limit) : reviews;

  return (
    <div className="columns-1 gap-8 sm:columns-2 lg:columns-3 [&>*]:mb-8">
      {shown.map((review, idx) => (
        <Reveal key={review.name} delay={(idx % 3) * 60} className="break-inside-avoid">
          <figure className="border-t-2 border-ink pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-sm tracking-[0.08em] text-accent-2">
                {review.initials}
              </span>
              <Stars rating={review.rating} />
            </div>

            <blockquote className="mt-4 font-serif text-lg leading-snug text-ink">
              {review.text}
            </blockquote>

            <figcaption className="mt-5 border-t border-line pt-4">
              <p className="text-sm font-semibold">{review.name}</p>
              <p className="mt-0.5 text-xs text-muted">{review.role}</p>
              <p className="mt-2 font-mono text-xs text-success">{review.result}</p>
            </figcaption>
          </figure>
        </Reveal>
      ))}
    </div>
  );
}