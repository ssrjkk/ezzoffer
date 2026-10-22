import Link from 'next/link';
import { Eyebrow } from '@/components/ui';
import { Reveal } from '@/components/reveal';

/*
 * Финальный призыв.
 *
 * Прежняя версия — скруглённый на 2rem прямоугольник с двумя размытыми
 * пятнами, сеткой на фоне и центрированным текстом: самый узнаваемый вид
 * финального экрана у ИИ-лендингов.
 *
 * Теперь это полоса на всю ширину, как объявление в конце газетной полосы:
 * чёрная подложка, линейка сверху, текст слева, действие справа. Никакой
 * симметрии — она и несла весь шаблонный вид.
 */

export function CtaBanner() {
  return (
    <section className="border-t border-line">
      <Reveal>
        <div className="grid gap-10 bg-ink px-7 py-14 md:grid-cols-12 md:items-end md:px-14 md:py-16">
          <div className="md:col-span-8">
            <Eyebrow tone="paper">Начните путь к лучшему офферу</Eyebrow>
            <h2 className="mt-6 font-serif text-3xl leading-snug text-paper text-balance md:text-5xl">
              Завтра отклики <span className="text-accent-on-dark">уйдут сами</span>
            </h2>
            <p className="measure mt-6 text-base leading-relaxed text-paper">
              24 часа бесплатного доступа без привязки карты. Подключите hh, запустите автопоиск —
              и занимайтесь своими делами, пока отклики уходят с письмами.
            </p>
          </div>

          <div className="md:col-span-4 md:text-right">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-paper px-7 py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-accent hover:text-white"
            >
              Попробовать бесплатно
              <span aria-hidden>→</span>
            </Link>
            <p className="mt-4 font-mono text-xs text-paper">
              Отмена в один клик · деньги не спишутся без подписки
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
