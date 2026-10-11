"use client";

import { useEffect, useRef, useState } from "react";
import { Section, SectionHead, GhostButton } from "@/components/ui";
import { BOT_COMMANDS, BOT_MESSAGES, type BotMessage } from "@/lib/bot-data";

/**
 * Живое превью Telegram-бота: диалог проигрывается по шагам, как в реальном
 * чате — сообщения печатаются по символам, перед первым показывается
 * индикатор «печатает…». Читается как скриншот живого диалога, а не как
 * статичная картинка.
 */
type Replay =
  | { phase: "thinking" }
  | { phase: "typing"; msg: BotMessage }
  | { phase: "idle"; index: number };

/** Следующее состояние и задержка до него. */
function advance(state: Replay): { state: Replay; delay: number } {
  if (state.phase === "idle") {
    const msg = BOT_MESSAGES[state.index];
    if (!msg) return { state, delay: 0 };
    // Пауза «печати» перед сообщением, затем первая буква.
    return { state: { phase: "typing", msg: { ...msg, text: msg.text.slice(0, 1) } }, delay: 16 };
  }
  if (state.phase === "thinking") {
    const msg = BOT_MESSAGES[0];
    if (!msg) return { state: { phase: "idle", index: 0 }, delay: 0 };
    return { state: { phase: "typing", msg: { ...msg, text: msg.text.slice(0, 1) } }, delay: 16 };
  }

  // phase === "typing": дописываем очередной символ.
  const full = BOT_MESSAGES.find((m) => m.text.startsWith(state.msg.text)) ?? null;
  if (!full || state.msg.text.length >= full.text.length) {
    // Сообщение дописано: возвращаемся в idle с указанием индекса.
    const index = BOT_MESSAGES.indexOf(full ?? BOT_MESSAGES[0]);
    return { state: { phase: "idle", index: index + 1 }, delay: full?.pauseAfterMs ?? 0 };
  }
  return {
    state: { phase: "typing", msg: { ...full, text: full.text.slice(0, state.msg.text.length + 1) } },
    delay: 16,
  };
}

function TelegramFrame() {
  const [done, setDone] = useState<BotMessage[]>([]);
  const [replay, setReplay] = useState<Replay>({ phase: "thinking" });
  const scroller = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let state: Replay = { phase: "thinking" };

    const scroll = () => {
      const el = scroller.current;
      if (el) el.scrollTop = el.scrollHeight;
    };

    const step = () => {
      // Сообщение дописывается, когда следующий шаг его завершит.
      if (state.phase === "typing") {
        const typed = state.msg.text;
        const full = BOT_MESSAGES.find((m) => m.text.startsWith(typed));
        if (full && full.text.length === typed.length) {
          setDone((prev) => [...prev, full]);
        }
      }

      const { state: next, delay } = advance(state);
      state = next;
      setReplay(next);
      scroll();
      if (delay > 0) timers.current.push(setTimeout(step, delay));
    };

    // Первое сообщение — от пользователя, поэтому сначала индикатор.
    timers.current.push(setTimeout(step, 700));

    return () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    };
  }, []);

  const partial = replay.phase === "typing" ? replay.msg : null;
  const thinking = replay.phase === "thinking";
  const finished = replay.phase === "idle" && replay.index >= BOT_MESSAGES.length;

  return (
    <div className="relative">
      {/*
        Макет переписки. Раньше вокруг него было размытое пятно на -inset-8 и
        тень с backdrop-blur — окно выглядело парящим над страницей. Теперь
        это плоский блок с волосяной рамкой, как врезка с иллюстрацией.
      */}
      <div className="overflow-hidden rounded-sm border border-line bg-surface">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <span className="grid size-8 place-items-center rounded-sm bg-[#229ED9] text-white">
            <TelegramGlyph className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">EZOffer Бот</p>
            <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              отвечает мгновенно
            </p>
          </div>
        </div>

        <div ref={scroller} className="h-[26rem] space-y-2.5 overflow-y-auto px-4 py-5 sm:h-[30rem]">
          {done.map((msg, i) => (
            <Bubble key={`done-${i}`} msg={msg} />
          ))}

          {thinking && <TypingBubble />}

          {partial && <Bubble msg={partial} caret />}

          {finished && (
            <p className="pt-6 text-center font-mono text-xs text-muted">Диалог проигран полностью</p>
          )}

          {!thinking && !partial && done.length === 0 && !finished && (
            <p className="pt-16 text-center text-sm text-muted">Подключение…</p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          <span className="flex-1 border-b border-line px-1 py-1.5 text-sm text-muted">
            Напишите сообщение…
          </span>
          <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-ink">
            <svg viewBox="0 0 24 24" className="size-4 text-paper" fill="currentColor" aria-hidden>
              <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

function TelegramGlyph({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.2 12.7 1.4 11.2c-1-.3-1-1 .2-1.5l19.1-7.4c.9-.3 1.6.2 1.2 2z" />
    </svg>
  );
}

function Avatar() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-[#229ED9] text-white">
      <TelegramGlyph />
    </span>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-end gap-2">
      <Avatar />
      <div className="flex items-center gap-1 rounded-sm rounded-bl-md border border-line bg-surface-2 px-4 py-3">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-1.5 animate-pulse-dot rounded-full bg-muted"
            style={{ animationDelay: `${dot * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function Caret() {
  return (
    <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse-dot bg-accent-2 align-text-bottom" />
  );
}

function Bubble({ msg, caret = false }: { msg: BotMessage; caret?: boolean }) {
  if (msg.from === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-sm rounded-br-md bg-ink px-4 py-2.5 text-sm leading-relaxed text-paper">
          {msg.text}
          {caret ? <Caret /> : null}
        </div>
      </div>
    );
  }
  const lines = msg.text.split("\n");
  return (
    <div className="flex items-end gap-2">
      <Avatar />
      <div className="max-w-[82%] rounded-sm rounded-bl-md border border-line bg-surface-2 px-4 py-2.5 text-sm leading-relaxed text-ink">
        {lines.map((line, i) => (
          <span key={i} className="block">
            {line}
            {caret && i === lines.length - 1 ? <Caret /> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TelegramBot() {
  return (
    <Section>
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHead
            center={false}
            eyebrow="Telegram-бот"
            title={
              <>
                Управляйте откликами <span className="text-accent">из мессенджера</span>
              </>
            }
            sub="Бот повторяет логику кабинета: подбирает вакансии под ваши критерии, готовит письмо и показывает статистику. Сайт открывать не нужно."
          />

          <div className="space-y-3">
            {BOT_COMMANDS.map((cmd) => (
              <div
                key={cmd.command}
                className="group flex items-start gap-4 rounded-sm border border-line bg-surface p-4 transition-colors hover:border-accent-2/40 hover:bg-surface"
              >
                <code className="shrink-0 rounded-sm bg-accent/10 px-2.5 py-1 font-mono text-xs text-accent-2">
                  /{cmd.command}
                </code>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{cmd.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">{cmd.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <GhostButton href="/dashboard/settings">Включить в кабинете</GhostButton>
          </div>
        </div>

        <div className="order-first lg:order-last">
          <TelegramFrame />
        </div>
      </div>
    </Section>
  );
}