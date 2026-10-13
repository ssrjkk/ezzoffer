import { requireUser, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { NO_STORE_HEADERS } from "@/lib/http";
import { loadLastRun } from "@/lib/autoapply-store";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const row = db.prepare("SELECT autoapply_paused FROM users WHERE id = ?").get(user.id) as {
    autoapply_paused: number;
  };
  /*
   * Отдаём вместе с паузой разбор последнего прогона.
   *
   * Отдельный маршрут потребовал бы второго запроса и показал бы данные
   * другого момента времени — панель мигнула бы в промежуточном состоянии.
   * Здесь оба ответа описывают одно и то же состояние.
   */
  return Response.json(
    { paused: Boolean(row.autoapply_paused), lastRun: loadLastRun() },
    { headers: NO_STORE_HEADERS },
  );
}