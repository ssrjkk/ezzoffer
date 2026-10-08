import { db, type User } from "./db";
import { getValidHhToken } from "./hh-oauth";
import { logError, logInfo } from "./logger";

/**
 * Синхронизация статусов откликов с hh.ru.
 * Реальный запрос к GET /negotiations/active с токеном пользователя.
 * Обновляет viewed_at/responded_at/response в БД по данным hh.
 */

const NEGOTIATIONS_URL = "https://api.hh.ru/negotiations/active";

type HhNegotiation = {
  state?: { id?: string; name?: string };
  created_at?: string;
  updated_at?: string;
  vacancy?: { id?: string; name?: string };
};

type HhNegotiationsResponse = {
  items?: HhNegotiation[];
};

export async function syncHhStatuses(userId: number): Promise<{ updated: number; error?: string }> {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as User | undefined;
  if (!user) return { updated: 0 };
  const token = (await getValidHhToken(user))?.token;
  if (!token || !user.hh_resume_id) {
    return { updated: 0 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(NEGOTIATIONS_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "EZOffer/1.0",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      return { updated: 0, error: `HTTP ${res.status}` };
    }
    if (!res.ok) return { updated: 0, error: `HTTP ${res.status}` };

    const data = (await res.json()) as HhNegotiationsResponse;
    const items = data.items ?? [];
    const hhVacancies = new Map<string, { state?: string; updatedAt?: string }>();
    for (const n of items) {
      if (n.vacancy?.id) {
        hhVacancies.set(n.vacancy.id, {
          state: n.state?.id ?? n.state?.name,
          updatedAt: n.updated_at,
        });
      }
    }

    let updated = 0;
    const apps = db
      .prepare(
        `SELECT a.id, a.job_slug, v.source_id FROM applications a
         JOIN vacancies v ON v.slug = a.job_slug
         WHERE a.user_id = ? AND a.withdrawn = 0 AND v.source = 'hh'`,
      )
      .all(userId) as { id: number; job_slug: string; source_id: string }[];

    for (const app of apps) {
      const hh = hhVacancies.get(app.source_id);
      if (!hh?.state) continue;
      const updatedAt = hh.updatedAt ? new Date(hh.updatedAt).getTime() : Date.now();
      const responded = hh.state === "invitation" || hh.state === "offer" || hh.state === "chat";
      const viewed = hh.state === "viewed" || responded;

      if (viewed) {
        const r = db
          .prepare("UPDATE applications SET viewed_at = COALESCE(viewed_at, ?) WHERE id = ? AND viewed_at IS NULL")
          .run(updatedAt, app.id);
        if (r.changes > 0) updated++;
      }
      if (responded) {
        const response = hh.state === "invitation" || hh.state === "offer" ? "interview" : "question";
        const r = db
          .prepare(
            `UPDATE applications SET responded_at = COALESCE(responded_at, ?), status = 'responded',
             response = CASE WHEN response = '' THEN ? ELSE response END
             WHERE id = ? AND responded_at IS NULL`,
          )
          .run(updatedAt, response, app.id);
        if (r.changes > 0) updated++;
      }
    }

    if (updated > 0) {
      logInfo("hh:sync", `обновлено статусов: ${updated}`, { userId });
    }
    return { updated };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network error";
    return { updated: 0, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export async function syncAllHhUsers(): Promise<void> {
  const users = db.prepare("SELECT id FROM users WHERE hh_token IS NOT NULL AND hh_token != ''").all() as {
    id: number;
  }[];
  for (const u of users) {
    try {
      await syncHhStatuses(u.id);
    } catch (err) {
      logError("hh:sync:all", err, { userId: u.id });
    }
  }
}