import { NextResponse } from "next/server";
import { runAutoApply } from "@/lib/autoapply";
import { saveLastRun } from "@/lib/autoapply-store";
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
  /*
   * Ручной запуск сохраняется так же, как плановый.
   *
   * Иначе прогон по требованию виден только в ответе этому запросу, а панель
   * в кабинете продолжала бы показывать предыдущий плановый итог — то есть
   * человек нажал «запустить», откликов прибавилось, а на экране ничего не
   * изменилось. Тишина в интерфейсе после действия читается как поломка.
   */
  saveLastRun(result);
  return NextResponse.json(result, { headers: NO_STORE_HEADERS });
}