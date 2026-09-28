import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import type { User } from "./db";
import { toPositiveNumber, validateSalaryRange } from "./validate";

export { toPositiveNumber, validateSalaryRange };

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return null;
  return user as User;
}

export function unauthorized() {
  return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function readJson<T>(
  request: Request,
): Promise<{ data?: T; error?: NextResponse }> {
  try {
    const text = await request.text();
    if (text.length > 200_000) {
      return { error: badRequest("Слишком большой запрос") };
    }
    const data = JSON.parse(text) as T;
    return { data };
  } catch {
    return { error: badRequest("Некорректный JSON") };
  }
}