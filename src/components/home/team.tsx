import { Section, SectionHead, PrimaryButton } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { team } from "@/lib/data";

export function Team() {
  return (
    <Section className="border-y border-line bg-surface/40">
      <SectionHead
        eyebrow="О нас"
        title={
          <>
            Маленькая команда, <span className="text-gradient">большой результат</span>
          </>
        }
        sub="Мы сами прошли через десятки ручных откликов — и собрали инструмент, который вернул нам часы жизни"
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {team.map((member, idx) => (
          <Reveal key={member.name} delay={idx * 80}>
            <article className="group h-full rounded-3xl border border-line bg-surface/60 p-6 text-center transition-all hover:-translate-y-1 hover:border-white/20">
              <span
                className={`mx-auto grid size-20 place-items-center rounded-full bg-gradient-to-br ${member.gradient} text-2xl font-bold text-white shadow-xl transition-transform duration-300 group-hover:scale-105`}
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

      <Reveal delay={100}>
        <div className="mt-12 text-center">
          <PrimaryButton href="/about">Узнать больше о нас</PrimaryButton>
        </div>
      </Reveal>
    </Section>
  );
}