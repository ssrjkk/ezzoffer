import { Section, SectionHead, PrimaryButton } from '@/components/ui';
import { Reveal } from '@/components/reveal';
import { team } from '@/lib/data';

export function Team() {
  return (
    <Section>
      <SectionHead
        eyebrow="О нас"
        title={
          <>
            Проект одного человека, <span className="text-accent">а не «команда экспертов»</span>
          </>
        }
        sub="Никаких выдуманных сооснователей с фото из стоков. Есть автор, который сам искал работу, сам пишет код и сам отвечает, когда что-то ломается."
      />

      <div className="grid gap-x-8 gap-y-10 border-t border-line pt-8 sm:grid-cols-2">
        {team.map((member, idx) => (
          <Reveal key={member.name} delay={idx * 70}>
            <article className="h-full">
              <p className="font-mono text-xs tracking-[0.14em] text-muted">{member.initials}</p>
              <h3 className="mt-3 font-serif text-xl leading-snug">{member.name}</h3>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-accent">
                {member.role}
              </p>
              <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted">{member.bio}</p>
            </article>
          </Reveal>
        ))}
        <Reveal delay={70}>
          <article className="flex h-full flex-col justify-between border-l-2 border-line pl-8">
            <div>
              <p className="font-mono text-xs tracking-[0.14em] text-muted">ВЫ</p>
              <h3 className="mt-3 font-serif text-xl leading-snug">Второй человек в команде</h3>
              <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted">
                Каждый баг-репорт и каждая жалоба «тут неудобно» попадают в работу напрямую, без
                отдела поддержки посередине. Если пользуетесь — рассказывайте, что бесит: это и
                есть роадмап.
              </p>
            </div>
            <div className="mt-6">
              <PrimaryButton href="/signup">Попробовать и рассказать</PrimaryButton>
            </div>
          </article>
        </Reveal>
      </div>
    </Section>
  );
}
