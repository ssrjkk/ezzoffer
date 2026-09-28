"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Section, SectionHead } from "@/components/ui";

function BeforeBlock() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 md:p-6">
      <p className="mb-4 inline-flex rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400 ring-1 ring-red-500/30">
        До — пропускает фильтры
      </p>
      <div className="space-y-4 text-left">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-red-500/15 text-red-400">ИИ</span>
          <div className="flex-1">
            <p className="h-2.5 w-2/3 rounded bg-red-400/40" />
            <p className="mt-2 h-2 w-full rounded bg-red-400/25" />
            <p className="mt-2 h-2 w-5/6 rounded bg-red-400/25" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-red-500/15 text-red-400">РП</span>
          <div className="flex-1">
            <p className="h-2.5 w-1/2 rounded bg-red-400/40" />
            <p className="mt-2 h-2 w-full rounded bg-red-400/25" />
            <p className="mt-2 h-2 w-4/6 rounded bg-red-400/25" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-red-500/15 text-red-400">HR</span>
          <div className="flex-1">
            <p className="h-2.5 w-3/4 rounded bg-red-400/40" />
            <p className="mt-2 h-2 w-full rounded bg-red-400/25" />
          </div>
        </div>
      </div>
      <p className="mt-5 text-center text-xs text-red-400/80">
        Общие фразы · нет цифр · не совпадает с вакансией
      </p>
    </div>
  );
}

function AfterBlock() {
  return (
    <div className="rounded-2xl border border-success/30 bg-surface p-5 shadow-[0_0_60px_-20px_rgba(52,211,153,0.4)] md:p-6">
      <p className="mb-4 inline-flex rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success ring-1 ring-success/30">
        После — проходит ATS-фильтры
      </p>
      <div className="space-y-4 text-left">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-success/15 text-success">ИИ</span>
          <div className="flex-1">
            <p className="h-2.5 w-2/3 rounded bg-success/70" />
            <p className="mt-2 h-2 w-full rounded bg-success/40" />
            <p className="mt-2 h-2 w-5/6 rounded bg-success/40" />
            <p className="mt-2 h-2 w-3/5 rounded bg-success/40" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-success/15 text-success">РП</span>
          <div className="flex-1">
            <p className="h-2.5 w-1/2 rounded bg-success/70" />
            <p className="mt-2 h-2 w-full rounded bg-success/40" />
            <p className="mt-2 h-2 w-4/6 rounded bg-success/40" />
            <p className="mt-2 h-2 w-3/4 rounded bg-success/40" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-success/15 text-success">HR</span>
          <div className="flex-1">
            <p className="h-2.5 w-3/4 rounded bg-success/70" />
            <p className="mt-2 h-2 w-full rounded bg-success/40" />
            <p className="mt-2 h-2 w-2/3 rounded bg-success/40" />
          </div>
        </div>
      </div>
      <p className="mt-5 text-center text-xs text-success/80">
        Цифры, ключевые навыки · структура под ATS · в 4 раза больше приглашений
      </p>
    </div>
  );
}

export function ResumeSlider() {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);

  const handlePointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(96, Math.max(4, x)));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPos((p) => Math.max(4, p - 6));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPos((p) => Math.min(96, p + 6));
    } else if (e.key === "Home") {
      e.preventDefault();
      setPos(4);
    } else if (e.key === "End") {
      e.preventDefault();
      setPos(96);
    }
  };

  return (
    <Section className="relative overflow-hidden" id="resume">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-80 w-[640px] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]" />
      <SectionHead
        eyebrow="Умное исправление резюме"
        title={
          <>
            Резюме, которое <span className="text-gradient">читают и пропускают</span> фильтры
          </>
        }
        sub="AI выделит вас среди кандидатов: структура, ключевые навыки и цифры под требования ATS и конкретных вакансий"
      />

      <div
        ref={ref}
        onPointerDown={handlePointer}
        onPointerMove={(e) => e.buttons === 1 && handlePointer(e)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className="relative mx-auto max-w-3xl cursor-ew-resize overflow-hidden rounded-3xl border border-line bg-surface-2 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        role="slider"
        aria-label="Сравнение резюме до и после"
        aria-valuenow={Math.round(pos)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="p-4 md:p-6">
          <AfterBlock />
        </div>

        <div
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${pos}%` }}
        >
          <div className="h-full p-4 md:p-6">
            <BeforeBlock />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
          <div className="absolute inset-y-0 -left-px w-0.5 bg-white/80 shadow-[0_0_20px_rgba(255,255,255,0.6)]" />
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="grid size-11 place-items-center rounded-full border-2 border-white bg-bg text-ink shadow-xl">
              <svg viewBox="0 0 24 24" className="size-5" fill="none">
                <path d="m9 7-5 5 5 5M15 7l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </div>

        <div className="pointer-events-none absolute top-3 left-3 rounded-full bg-bg/80 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
          До
        </div>
        <div className="pointer-events-none absolute top-3 right-3 rounded-full bg-success/20 px-3 py-1 text-xs font-medium text-success backdrop-blur">
          После
        </div>
      </div>

      <p className="mt-5 text-center text-sm text-muted">
        Потяните ползунок, чтобы сравнить
      </p>
    </Section>
  );
}