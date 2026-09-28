"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export type AuthMode = "login" | "signup";

export function AuthForm({ mode, next }: { mode: AuthMode; next?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dest = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "login" ? { email, password } : { name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Что-то пошло не так. Попробуйте ещё раз.");
        return;
      }
      router.push(dest);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "login" ? "Вход в аккаунт" : "Создать аккаунт";
  const submitLabel = mode === "login" ? "Войти" : "Создать аккаунт и получить 24 часа бесплатно";
  const otherHref = mode === "login" ? "/signup" : "/login";
  const otherLabel = mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти";

  return (
    <div className="mx-auto mt-10 max-w-md">
      <form onSubmit={onSubmit} className="glass space-y-5 rounded-3xl p-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted">
            {mode === "signup"
              ? "24 часа бесплатно. Без привязки карты, отмена в один клик."
              : "Рады видеть вас снова"}
          </p>
        </div>

        {mode === "signup" ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-muted">Имя</span>
            <input
              required
              autoComplete="name"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как к вам обращаться"
              className="w-full rounded-xl border border-line bg-bg/60 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            maxLength={100}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-line bg-bg/60 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Пароль</span>
          <input
            type="password"
            required
            minLength={6}
            maxLength={100}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-line bg-bg/60 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </label>

        {mode === "signup" ? (
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted">
            <input
              type="checkbox"
              required
              className="mt-0.5 size-4 rounded border-line bg-bg accent-accent"
            />
            <span>
              Согласен с{" "}
              <Link href="/faq" className="underline decoration-line underline-offset-2 hover:text-ink">
                условиями сервиса
              </Link>{" "}
              и политикой конфиденциальности
            </span>
          </label>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-white shadow-[0_0_36px_-8px_rgba(124,92,255,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Подождите…" : submitLabel}
        </button>

        <p className="text-center text-sm">
          <Link href={otherHref} className="text-accent-2 transition-colors hover:underline">
            {otherLabel}
          </Link>
        </p>
      </form>

      <p className="mt-5 text-center text-xs text-muted">
        Авторизовавшись, вы получите доступ к личному кабинету: резюме, автопоиск и статистика откликов.
      </p>
    </div>
  );
}