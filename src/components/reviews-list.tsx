import { Reveal } from "@/components/reveal";
import { reviews } from "@/lib/data";

export function ReviewsList() {
  return (
    <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5">
      {reviews.map((review, idx) => (
        <Reveal key={review.name} delay={(idx % 3) * 60} className="break-inside-avoid">
          <figure className="rounded-3xl border border-line bg-surface/70 p-6 transition-colors hover:border-white/20">
            <div className="flex items-center justify-between gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-accent/40 to-accent-2/30 text-xs font-bold">
                {review.initials}
              </span>
              <span className="text-sm text-warn" aria-label={`${review.rating} из 5`}>
                {"★".repeat(review.rating)}
                {"☆".repeat(5 - review.rating)}
              </span>
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
  );
}