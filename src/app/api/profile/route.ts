import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser, unauthorized, readJson } from "@/lib/api";
import { db, getUserByEmail } from "@/lib/db";
import { hashPassword, verifyPassword, SESSION_COOKIE } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/http";

export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { data, error } = await readJson<{
    name?: string;
    email?: string;
    password?: string;
    currentPassword?: string;
  }>(request);
  if (error) return error;

  const name = (data?.name ?? "").trim();
  if (name && name.length > 0) {
    if (name.length > 60) {
      return NextResponse.json({ error: "Имя слишком длинное (до 60 символов)" }, { status: 400 });
    }
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, user.id);
  }

  const email = data?.email?.trim().toLowerCase();
  if (email && email !== user.email) {
    if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
    }
    // Смена email — чувствительная операция: требуем подтверждение текущим паролем.
    const currentPassword = data?.currentPassword ?? "";
    if (!currentPassword || !verifyPassword(currentPassword, user.password_hash)) {
      return NextResponse.json(
        { error: "Для смены email укажите текущий пароль" },
        { status: 403 },
      );
    }
    if (getUserByEmail(email)) {
      return NextResponse.json({ error: "Этот email уже занят" }, { status: 409 });
    }
    try {
      db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, user.id);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return NextResponse.json({ error: "Этот email уже занят" }, { status: 409 });
      }
      throw err;
    }
  }

  const password = data?.password ?? "";
  if (password.length > 0) {
    if (password.length < 6 || password.length > 100) {
      return NextResponse.json({ error: "Пароль должен быть от 6 до 100 символов" }, { status: 400 });
    }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      hashPassword(password),
      user.id,
    );
    // Смена пароля инвалидирует остальные сессии (кроме текущей), включая украденные.
    const store = await cookies();
    const currentToken = store.get(SESSION_COOKIE)?.value;
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(
      user.id,
      currentToken ?? "",
    );
  }

  return Response.json({ ok: true });
}