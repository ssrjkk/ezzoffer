import { PrimaryButton } from "@/components/ui";
import { Reveal } from "@/components/reveal";

export function CtaBanner() {
  return (
    <section className="container-x pb-20 pt-4 md:pb-28">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br from-accent/25 via-surface to-accent-2/15 px-7 py-16 text-center md:px-14 md:py-20">
          <div className="pointer-events-none absolute inset-0 bg-grid mask-fade-y opacity-60" />
          <div className="pointer-events-none absolute -top-24 left-1/4 h-64 w-64 rounded-full bg-accent/40 blur-[110px]" />
          <div className="pointer-events-none absolute -bottom-24 right-1/4 h-64 w-64 rounded-full bg-accent-2/30 blur-[110px]" />

          <div className="relative">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-accent-2">
              Начните путь к лучшему офферу
            </p>
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-balance md:text-5xl">
              Завтра уже кто-то откликнется <span className="text-gradient">вместо вас</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted">
              24 часа бесплатного доступа без привязки карты. Пока другие соискатели кликают
              вручную, вы уже на собеседовании.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <PrimaryButton href="/signup">Попробовать бесплатно</PrimaryButton>
            </div>
            <p className="mt-4 text-xs text-muted">
              Отмена в один клик · деньги не спишутся без подписки
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}