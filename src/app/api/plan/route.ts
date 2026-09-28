import { NextResponse } from "next/server";
import { requireUser, unauthorized, readJson } from "@/lib/api";
import { db, type User } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_PLANS = ["start", "pro", "expert"];
const VALID_PERIODS = [7, 14, 30];

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { data, error } = await readJson<{ planId?: string; period?: number }>(request);
  if (error) return error;

  const plan = data?.planId ?? "";
  const period = Number(data?.period ?? 14);
  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: "Неизвестный тариф" }, { status: 400 });
  }
  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json({ error: "Неверный период" }, { status: 400 });
  }

  const now = Date.now();
  db.prepare(
    `UPDATE users SET plan = ?, plan_period = ?, plan_activated_at = ?, plan_expires_at = ? WHERE id = ?`,
  ).run(plan, period, now, now + period * DAY_MS, user.id);

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as User;
  return Response.json({
    plan: {
      id: updated.plan,
      period: updated.plan_period,
      expires_at: updated.plan_expires_at,
    },
    note: "Демо-режим: оплата отключена, тариф активирован без списания.",
  });
}