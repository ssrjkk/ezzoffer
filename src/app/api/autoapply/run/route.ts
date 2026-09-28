import { NextResponse } from "next/server";
import { runAutoApply } from "@/lib/autoapply";
import { NO_STORE_HEADERS } from "@/lib/http";

// Запуск автооткликов по требованию. Защищён CRON_SECRET (или переданным ключом),
// чтобы злоумышленник не мог дёргать воркер произвольно.
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET не настроен" }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const result = await runAutoApply();
  return NextResponse.json(result, { headers: NO_STORE_HEADERS });
}