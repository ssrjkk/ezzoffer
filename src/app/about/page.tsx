import type { Metadata } from "next";
import { Section, SectionHead, PrimaryButton, Badge } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { team, stats } from "@/lib/data";

export const metadata: Metadata = {
  title: "О нас",
  description: "Команда EZOffer — AI-агент для поиска работы. Наша миссия, принципы и люди, которые делают продукт.",
};

const values = [
  {
    title: "Время дороже кликов",
    text: "Поиск работы не должен съедать часы. Мы автоматизируем всё, что допустимо автоматизировать, и оставляем человеку главное — собеседования и выбор.",
  },
  {
    title: "Честные цифры",
    text: "Никаких «магических кнопок». Мы показываем воронку откликов как есть и помогаем чинить то, что реально мешает приглашениям.",
  },
  {
    title: "В рамках правил",
    text: "Работаем только через официальные механизмы платформ. Никаких серых схем, рисков и блокировок.",
  },
  {
    title: "Пользователь — владелец",
    text: "Вы решаете, на какие вакансии откликаться и что отправлять. Сервис исполняет, а не управляет вашим профилем.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Section className="pb-8 pt-16 md:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <Badge>Команда и миссия</Badge>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-balance md:text-6xl">
              Мы вернули себе <span className="text-gradient">часы жизни</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted md:text-xl">
              Каждый из нас проходил через десятки ручных откликов, автоотказы и бесконечное
              ожидание. И решил построить инструмент, который делает поиск работы управляемым
              процессом, а не лотереей.
            </p>
          </Reveal>
        </div>
      </Section>

      <Section className="border-y border-line bg-surface/40">
        <SectionHead
          eyebrow="Принципы"
          title={
            <>
              Чем мы руководствуемся
            </>
          }
        />
        <div className="grid gap-5 sm:grid-cols-2">
          {values.map((value, idx) => (
            <Reveal key={value.title} delay={idx * 70}>
              <article className="h-full rounded-3xl border border-line bg-bg/60 p-7 transition-colors hover:border-accent/40">
                <span className="text-sm font-semibold text-accent-2">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-xl font-semibold tracking-tight">{value.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted md:text-base">{value.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHead
          eyebrow="Результаты"
          title={
            <>
              Цифры, которыми мы <span className="text-gradient">гордимся</span>
            </>
          }
        />
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="glass rounded-2xl px-5 py-6 text-center transition-colors hover:border-white/20"
            >
              <dt className="text-3xl font-semibold tracking-tight text-gradient md:text-4xl">
                {stat.value}
              </dt>
              <dd className="mt-2 text-xs leading-snug text-muted md:text-sm">{stat.label}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section className="border-t border-line bg-surface/40">
        <SectionHead
          eyebrow="Команда"
          title={
            <>
              Кто делает <span className="text-gradient">EZOffer</span>
            </>
          }
          sub="Небольшая команда с фокусом на результат — как вы на поиске работы"
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((member, idx) => (
            <Reveal key={member.name} delay={idx * 80}>
              <article className="group h-full rounded-3xl border border-line bg-surface/60 p-6 text-center transition-all hover:-translate-y-1 hover:border-white/20">
                <span
                  className={`mx-auto grid size-20 place-items-center rounded-full bg-gradient-to-br ${member.gradient} text-2xl font-bold text-white shadow-xl`}
                >
                  {member.initials}
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{member.name}</h3>
                <p className="mt-1 text-sm text-accent-2">{member.role}</p>
                <p className="mt-4 text-sm leading-relaxed text-muted">{member.bio}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-gradient-to-br from-accent/20 to-accent-2/10 p-10 text-center md:p-14">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Готовы попробовать?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted md:text-base">
            24 часа бесплатного доступа. Улучшенное резюме, подбор вакансий и первые автоотклики
            — уже сегодня.
          </p>
          <div className="mt-7">
            <PrimaryButton href="/signup">Начать бесплатно</PrimaryButton>
          </div>
        </div>
      </Section>
    </>
  );
}