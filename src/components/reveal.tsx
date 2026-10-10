"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/**
 * Появление блока при прокрутке.
 *
 * Проп as — не украшение. Появление при прокрутке почти всегда применяют
 * внутри списков, а <ol>/<ul> допускают только <li> прямыми потомками:
 * обёртка-<div> внутри списка ломает семантику, и axe репортит
 * «list/listitem has wrong structure», а скринридер объявляет список
 * как обычный блок без позиций.
 *
 * Поэтому элемент задаётся явно: <Reveal as="li"> внутри <ol>.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Элемент-обёртка. Ставьте "li" внутри <ol>/<ul>, "figure" внутри списка
   *  цитат и т. п. */
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}