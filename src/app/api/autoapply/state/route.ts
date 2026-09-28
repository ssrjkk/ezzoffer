import { requireUser, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { NO_STORE_HEADERS } from "@/lib/http";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const row = db.prepare("SELECT autoapply_paused FROM users WHERE id = ?").get(user.id) as {
    autoapply_paused: number;
  };
  return Response.json({ paused: Boolean(row.autoapply_paused) }, { headers: NO_STORE_HEADERS });
}