import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/api";
import { db, type User } from "@/lib/db";

const TRIAL_MS = 24 * 60 * 60 * 1000;

export async function POST() {
  const user = await requireUser();
  if (!user) return unauthorized();

  if (user.trial_started_at) {
    return NextResponse.json(
      { error: "Пробный период уже был активирован" },
      { status: 409 },
    );
  }
  if (["start", "pro", "expert"].includes(user.plan)) {
    return NextResponse.json(
      { error: "У вас уже активен платный тариф" },
      { status: 409 },
    );
  }

  const now = Date.now();
  db.prepare(
    `UPDATE users SET plan = 'trial', plan_period = 1, plan_activated_at = ?, plan_expires_at = ?, trial_started_at = ? WHERE id = ?`,
  ).run(now, now + TRIAL_MS, now, user.id);

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as User;
  return Response.json({
    plan: {
      id: updated.plan,
      expires_at: updated.plan_expires_at,
      trial_started_at: updated.trial_started_at,
    },
  });
}