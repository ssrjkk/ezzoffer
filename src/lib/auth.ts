import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { db, getUserById, type User } from "./db";

export { hashPassword, verifyPassword } from "./password";

export const SESSION_COOKIE = "ez_session";
const SESSION_DAYS = 30;

export function createSession(userId: number): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").run(userId, Date.now());
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expiresAt,
  );
  return { token, expiresAt };
}

export function destroySession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function isHttpsRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto") ?? "";
  if (forwarded.split(",")[0]?.trim() === "https") return true;
  return new URL(request.url).protocol === "https:";
}

export function getSessionUser(token?: string): User | undefined {
  if (!token) return undefined;
  const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token) as
    | { user_id: number; expires_at: number }
    | undefined;
  if (!session) return undefined;
  if (session.expires_at <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return undefined;
  }
  return getUserById(session.user_id);
}

export function rotateSession(token: string): { token: string; expiresAt: number } | null {
  const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token) as
    | { user_id: number; expires_at: number }
    | undefined;
  if (!session || session.expires_at <= Date.now()) return null;
  const newToken = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare("UPDATE sessions SET token = ?, expires_at = ? WHERE token = ?").run(
    newToken,
    expiresAt,
    token,
  );
  return { token: newToken, expiresAt };
}

export async function getCurrentUser(): Promise<User | undefined> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return getSessionUser(token);
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    plan_expires_at: user.plan_expires_at,
    trial_started_at: user.trial_started_at,
  };
}