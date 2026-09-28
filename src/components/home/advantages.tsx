import Link from "next/link";
import { Section, SectionHead } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { advantages } from "@/lib/data";

const icons: Record<string, React.ReactNode> = {
  activity: (
    <path
      d="M3 12h4l3 8 4-16 3 8h4"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      stroke="currentColor"
      fill="none"
    />
  ),
  filter: (
    <path
      d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      stroke="currentColor"
      fill="none"
    />
  ),
  chart: (
    <path
      d="M3 21h18M7 17v-6M12 17V7M17 17v-4M3 3v18"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      stroke="currentColor"
      fill="none"
    />
  ),
  telegram: (
    <path
      d="m22 3-3.5 17-7.5-4.5L6 20l1-6L3 11l19-8Zm-6 5L9 14.5M22 3 11 13"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      stroke="currentColor"
      fill="none"
    />
  ),
  compass: (
    <path
      d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3 6-1.5 4.5L9 15l1.5-4.5L15 9Z"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      stroke="currentColor"
      fill="none"
    />
  ),
  files: (
    <path
      d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h6"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      stroke="currentColor"
      fill="none"
    />
  ),
};

export function Advantages() {
  return (
    <Section className="relative border-y border-line bg-surface/40">
      <div className="pointer-events-none absolute right-0 top-1/4 h-80 w-80 rounded-full bg-accent-2/10 blur-[120px]" />
      <SectionHead
        eyebrow="Преимущества сервиса"
        title={
          <>
            Всё для <span className="text-gradient">результата</span>
          </>
        }
        sub="Находим лучшие вакансии, анализируем отклики и делаем поиск работы результативным"
      />

      <div className="grid auto-rows-fr gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {advantages.map((item, idx) => (
          <Reveal
            key={item.title}
            delay={idx * 70}
            className={item.wide ? "sm:col-span-2 lg:col-span-1 lg:row-span-1" : ""}
          >
            <div className="group relative h-full overflow-hidden rounded-3xl border border-line bg-bg/60 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-accent-2/40">
              <div className="pointer-events-none absolute -bottom-20 -right-14 size-44 rounded-full bg-accent/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
              <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-accent/25 to-accent-2/20 ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                <svg viewBox="0 0 24 24" className="size-5.5">
                  {icons[item.icon]}
                </svg>
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight md:text-xl">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted md:text-base">{item.text}</p>
            </div>
          </Reveal>
        ))}

        <Reveal
          delay={200}
          className="sm:col-span-2 lg:col-span-1"
        >
          <div className="relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-3xl bg-gradient-to-br from-accent via-accent/80 to-accent-2 p-7 text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/15 blur-2xl" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-white/70">
                Боитесь?
              </p>
              <h3 className="mt-2 text-2xl font-semibold leading-snug tracking-tight">
                Делегируйте рутину и займитесь собеседованиями
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/85">
                Первые приглашения приходят уже через 2–3 дня. Дальше всё зависит только от вашего
                опыта — умения заинтересовать работодателя и вести диалог.
              </p>
            </div>
            <Link
              href="/signup"
              className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-accent transition-transform hover:scale-[1.03]"
            >
              Получить первый оффер
              <span aria-hidden>→</span>
            </Link>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}