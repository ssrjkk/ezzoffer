import { requireUser, unauthorized } from "@/lib/api";
import { db, type User } from "@/lib/db";
import { hhConfigured } from "@/lib/hh-oauth";
import { NO_STORE_HEADERS } from "@/lib/http";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as User;
  const connected = Boolean(fresh.hh_token && fresh.hh_token_expires_at && fresh.hh_token_expires_at > Date.now());
  const resumeId = fresh.hh_resume_id;

  return Response.json(
    {
      configured: hhConfigured(),
      connected,
      resume_id: resumeId ?? null,
      expires_at: fresh.hh_token_expires_at,
    },
    { headers: NO_STORE_HEADERS },
  );
}