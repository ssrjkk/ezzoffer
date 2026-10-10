"use client";

import { useState } from "react";
import { Section, SectionHead } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { faq } from "@/lib/data";

export function FaqAccordion() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <Section className="relative">
      <SectionHead
        eyebrow="FAQ"
        title={
          <>
            Ответы на <span className="text-accent">частые вопросы</span>
          </>
        }
        sub="Мы уже ответили на всё, что обычно спрашивают перед стартом"
      />

      <div className="mx-auto max-w-3xl space-y-3">
        {faq.map((item, idx) => {
          const open = openIdx === idx;
          return (
            <Reveal key={item.q} delay={idx * 40}>
              <div
                className={`overflow-hidden border-b transition-colors ${
                  open ? "border-accent" : "border-line"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(open ? null : idx)}
                  aria-expanded={open}
                  aria-controls={`faq-panel-${idx}`}
                  id={`faq-button-${idx}`}
                  className="flex w-full items-start justify-between gap-6 py-5 text-left"
                >
                  {/* Вопрос антиквой и крупнее ответа: в FAQ читают вопросы,
                      ответы проглатывают. Раньше оба были одинакового
                      кегля sans-serif. */}
                  <span className="font-serif text-lg leading-snug md:text-xl">{item.q}</span>
                  {/* Плюс превращается в крест — типографский приём вместо
                      круглой кнопки с вращающимся плюсом. */}
                  <span
                    aria-hidden
                    className={`mt-1 shrink-0 font-mono text-xl leading-none transition-transform duration-200 ${
                      open ? "rotate-45 text-accent" : "text-muted"
                    }`}
                  >
                    +
                  </span>
                </button>
                <div
                  id={`faq-panel-${idx}`}
                  role="region"
                  aria-labelledby={`faq-button-${idx}`}
                  className={`grid transition-all duration-300 ${
                    open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="measure pb-6 text-sm leading-relaxed text-muted md:text-base">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}