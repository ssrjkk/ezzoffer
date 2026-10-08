import { requireUser, unauthorized } from "@/lib/api";
import { db, type User } from "@/lib/db";
import { hhConfigured } from "@/lib/hh-oauth";
import { NO_STORE_HEADERS } from "@/lib/http";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as User;
  const tokenValid = Boolean(
    fresh.hh_token && fresh.hh_token_expires_at && fresh.hh_token_expires_at > Date.now(),
  );
  // Протухший access-токен не значит «не подключено»: getValidHhToken умеет
  // обновить его по refresh_token, и автоотклики продолжат работать. Раньше
  // UI в этом случае предлагал подключиться заново, хотя всё работало.
  const canRefresh = Boolean(fresh.hh_refresh_token) && hhConfigured();
  const connected = (tokenValid || canRefresh) && Boolean(fresh.hh_resume_id);
  const resumeId = fresh.hh_resume_id;

  return Response.json(
    {
      configured: hhConfigured(),
      connected,
      /** Токен протух, но будет обновлён автоматически. */
      refreshable: !tokenValid && canRefresh,
      resume_id: resumeId ?? null,
      expires_at: fresh.hh_token_expires_at,
    },
    { headers: NO_STORE_HEADERS },
  );
}