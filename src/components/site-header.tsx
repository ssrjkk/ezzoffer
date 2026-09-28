"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const nav = [
  { href: "/#how-it-work", label: "Как это работает" },
  { href: "/pricing", label: "Тарифы" },
  { href: "/jobs", label: "Вакансии" },
  { href: "/resume-examples", label: "Примеры резюме" },
  { href: "/internships", label: "Стажировки" },
  { href: "/blog", label: "Блог" },
  { href: "/faq", label: "FAQ" },
];

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group flex items-center gap-2.5 ${className}`} aria-label="EZOffer — на главную">
      <span className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 shadow-[0_0_24px_-6px_rgba(124,92,255,0.9)] transition-transform group-hover:rotate-[-8deg]">
        <svg viewBox="0 0 24 24" fill="none" className="size-5 text-white">
          <path
            d="M13 2 4.5 13.5h6L11 22l8.5-11.5h-6L13 2Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span className="text-lg font-bold tracking-tight">
        EZ<span className="text-gradient">Offer</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<{ name: string } | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setUser(d?.user ?? null))
      .catch(() => setUser(null));
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="container-x flex h-16 items-center justify-between gap-4 md:h-[72px]">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Основная навигация">
          {nav.map((item) => {
            const active = item.href !== "/#how-it-work" && pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3.5 py-2 text-sm transition-colors ${
                  active
                    ? "bg-white/10 text-ink"
                    : "text-muted hover:bg-white/5 hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <Link
              href="/dashboard"
              className="hidden rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_-8px_rgba(124,92,255,0.8)] transition hover:brightness-110 sm:block"
            >
              Кабинет
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-full px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-ink sm:block"
              >
                Войти
              </Link>
              <Link
                href="/signup"
                className="hidden rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_-8px_rgba(124,92,255,0.8)] transition hover:brightness-110 sm:block"
              >
                24 часа бесплатно
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid size-10 place-items-center rounded-xl border border-line bg-white/5 lg:hidden"
            aria-expanded={open}
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
          >
            <span className="sr-only">Меню</span>
            <div className="flex w-5 flex-col gap-1.5">
              <span
                className={`h-0.5 rounded bg-ink transition-transform ${open ? "translate-y-2 rotate-45" : ""}`}
              />
              <span className={`h-0.5 rounded bg-ink transition-opacity ${open ? "opacity-0" : ""}`} />
              <span
                className={`h-0.5 rounded bg-ink transition-transform ${open ? "-translate-y-2 -rotate-45" : ""}`}
              />
            </div>
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-line bg-bg/95 backdrop-blur-xl lg:hidden">
          <nav className="container-x flex flex-col gap-1 py-4" aria-label="Мобильная навигация">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-sm font-medium text-muted transition-colors hover:bg-white/5 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-line pt-4">
              {user ? (
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="rounded-full bg-accent px-5 py-3 text-center text-sm font-semibold text-white"
                >
                  Кабинет
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="rounded-full border border-line px-5 py-3 text-center text-sm font-semibold text-ink"
                  >
                    Войти
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setOpen(false)}
                    className="rounded-full bg-accent px-5 py-3 text-center text-sm font-semibold text-white"
                  >
                    24 часа бесплатно
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
