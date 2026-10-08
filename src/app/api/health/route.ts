import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Healthcheck для Docker и внешних балансировщиков.
 * Проверяет, что процесс отвечает и что SQLite доступна для чтения.
 */
export function GET() {
  try {
    const row = db.prepare("SELECT 1 AS ok").get() as { ok: number };
    return NextResponse.json(
      { status: "ok", db: row.ok === 1 ? "up" : "unknown", uptime: Math.round(process.uptime()) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", db: "down" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
