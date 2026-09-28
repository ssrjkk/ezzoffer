import { db, type User } from "./db";
import { randomBytes } from "node:crypto";

/**
 * Подключение аккаунта hh.ru через OAuth2 (authorization_code).
 * Всё активируется через env: HH_CLIENT_ID, HH_CLIENT_SECRET, HH_REDIRECT_URI.
 * Без ключей flow честно недоступен.
 */

const AUTH_URL = "https://hh.ru/oauth/authorize";
const TOKEN_URL = "https://api.hh.ru/token";
const RESUMES_URL = "https://api.hh.ru/resumes/mine";

export function hhConfigured(): boolean {
  return Boolean(
    process.env.HH_CLIENT_ID?.trim() &&
      process.env.HH_CLIENT_SECRET?.trim() &&
      process.env.HH_REDIRECT_URI?.trim(),
  );
}

export function hhAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.HH_CLIENT_ID ?? "",
    redirect_uri: process.env.HH_REDIRECT_URI ?? "",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type HhTokenResponse = {
  access_token?: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export async function exchangeCode(code: string): Promise<HhTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.HH_CLIENT_ID ?? "",
    client_secret: process.env.HH_CLIENT_SECRET ?? "",
    redirect_uri: process.env.HH_REDIRECT_URI ?? "",
    code,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
  });
  const data = (await res.json()) as HhTokenResponse;
  if (!res.ok || !data.access_token) {
    return { error: data.error ?? `HTTP ${res.status}`, error_description: data.error_description };
  }
  return data;
}

export async function fetchHhResumeId(accessToken: string): Promise<string | null> {
  const res = await fetch(RESUMES_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "User-Agent": "EZOffer/1.0" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: { id?: string; title?: string }[] };
  const item = data.items?.find((r) => r.id);
  return item?.id ?? null;
}

export async function refreshAccessToken(refreshToken: string): Promise<HhTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.HH_CLIENT_ID ?? "",
    client_secret: process.env.HH_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
  });
  const data = (await res.json()) as HhTokenResponse;
  if (!res.ok || !data.access_token) {
    return { error: data.error ?? `HTTP ${res.status}`, error_description: data.error_description };
  }
  return data;
}

export function saveHhConnection(
  user: User,
  token: string,
  refreshToken: string | undefined,
  expiresIn: number,
  resumeId: string,
): void {
  db.prepare(
    `UPDATE users SET hh_token = ?, hh_token_expires_at = ?, hh_resume_id = ? WHERE id = ?`,
  ).run(token, Date.now() + Math.max(expiresIn, 60) * 1000, resumeId, user.id);
}

export function clearHhConnection(userId: number): void {
  db.prepare(
    "UPDATE users SET hh_token = NULL, hh_token_expires_at = NULL, hh_resume_id = NULL WHERE id = ?",
  ).run(userId);
}

export function generateOauthState(): string {
  return randomBytes(24).toString("hex");
}