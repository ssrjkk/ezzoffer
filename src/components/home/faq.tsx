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
            Ответы на <span className="text-gradient">частые вопросы</span>
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
                className={`overflow-hidden rounded-2xl border transition-all duration-300 ${
                  open ? "border-accent/40 bg-surface/80" : "border-line bg-surface/50 hover:border-white/20"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(open ? null : idx)}
                  aria-expanded={open}
                  aria-controls={`faq-panel-${idx}`}
                  id={`faq-button-${idx}`}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="text-sm font-semibold md:text-base">{item.q}</span>
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full border transition-all duration-300 ${
                      open
                        ? "rotate-45 border-accent bg-accent/20 text-accent-2"
                        : "border-line text-muted"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="size-4" fill="none">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
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
                    <p className="px-6 pb-6 text-sm leading-relaxed text-muted md:text-[15px]">
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