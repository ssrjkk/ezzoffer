import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { stories } from "@/lib/data";

/*
 * Истории успеха.
 *
 * Прежняя версия — три карточки с градиентной шапкой, «блеском»-линейкой
 * сверху и круглым аватаром из градиента. Ни то, ни другое ничего не
 * сообщало читателю.
 *
 * Теперь это врезки: имя и должность, цитата антиквой, результат акцентом.
 * Истории читаются как текст, а не как ячейки каталога.
 *
 * Полоса инверсная — и это сделано по двум причинам, а не ради эффекта.
 *
 * Первая: на главной четырнадцать секций с одинаковыми отступами и одинаковой
 * волосяной линейкой. Ритм не менялся ни разу за всю страницу, и глаз
 * переставал различать блоки — к десятому экрану всё выглядело одинаково.
 * Инверсия раз в страницу возвращает ощущение смены полосы: после неё
 * возвращение на бумагу читается как возврат в светлое.
 *
 * Вторая, важнее: люди, которые получили оффер, — это свидетельство, а
 * свидетельство на тёмном фоне читается как врезка в журнале. На бумаге
 * рядом с остальными блоками оно выглядело как ещё одна секция про то же
 * самое, и доверия вызывало меньше, чем заслуживает.
 */

export function Stories() {
  return (
    <section className="bg-ink py-20 md:py-28">
      <div className="container-x">
        <div className="max-w-3xl">
          {/* Метка на тёмном фоне — красная заливка читается, но канцелярская
              прописная строка на чернилах была бы почти неразличима. */}
          <p className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-paper">
            <span aria-hidden className="block h-px w-7 bg-accent" />
            Истории успеха
          </p>
          <h2 className="mt-4 text-balance font-serif text-3xl leading-snug text-paper md:text-5xl">
            Работа мечты ближе вместе с EZOffer
          </h2>
          <p className="measure mt-5 text-base leading-relaxed text-paper md:text-lg">
            Реальные истории пользователей, которые получили оффер вместе с нами.
          </p>
        </div>

        <div className="mt-12 grid gap-x-8 gap-y-10 border-t border-paper/25 pt-8 md:grid-cols-3">
          {stories.map((story, idx) => (
            <Reveal key={story.name} delay={idx * 80}>
              <article className="flex h-full flex-col">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    {/* Имя антиквой: на тёмном фоне оно становится главным
                        элементом врезки, как заголовок в журнале. */}
                    <p className="font-serif text-lg leading-snug text-paper">{story.name}</p>
                    <p className="mt-1 text-sm text-paper">{story.role}</p>
                  </div>
                </div>

                <blockquote className="mt-4 flex-1 font-serif text-lg leading-relaxed text-paper">
                  {story.text}
                </blockquote>

                <p className="mt-5 font-mono text-sm text-accent-on-dark">{story.result}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <div className="mt-12">
          <Link
            href="/reviews"
            className="inline-flex items-center gap-2 border-b border-paper pb-0.5 text-sm font-semibold text-paper transition-colors hover:border-accent hover:text-accent"
          >
            Все отзывы
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}