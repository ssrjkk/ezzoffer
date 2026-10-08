import { envNum } from "@/lib/env";

/**
 * Instrumentation работает и в Edge, и в Node. Node-модули (fs, пути, SQLite)
 * нельзя тянуть в Edge-бандл, поэтому весь Node-код подключается динамическим
 * import() уже после проверки NEXT_RUNTIME — именно это требует документация Next.
 *
 * Важно: turbopackIgnore на этих импортах ставить нельзя. Пометка оставляет
 * спецификатор "@/lib/..." как есть, и в собранном сервере он не резолвится:
 * "Cannot find package '@/lib' imported from .next/standalone/.../chunks/
 * src_instrumentation_ts_*.js". Динамический import() и так не выполняется в
 * Edge, а Turbopack при этом корректно бандлит модуль для Node-части.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { logError, logInfo } = await import("@/lib/logger");

  process.on("unhandledRejection", (reason) => {
    logError("process:unhandledRejection", reason instanceof Error ? reason : new Error(String(reason)));
  });

  // Планировщик: автоотклики, обновление каталога, синхронизация hh.
  // envNum, а не Number(process.env.X ?? default): Number("") === 0, и пустая
  // переменная в .env.example полностью отключала бы планировщик.
  const intervalMs = envNum(process.env, "SCHEDULER_INTERVAL_MS", 5 * 60 * 1000, { min: 60_000 });
  if (intervalMs < 60_000) return;

  logInfo("scheduler", `интервал запуска: ${Math.round(intervalMs / 1000)} с`);
  const tick = async (): Promise<void> => {
    try {
      const { runScheduledJobs } = await import("@/lib/scheduler");
      await runScheduledJobs();
    } catch (err) {
      logError("scheduler:schedule", err);
    }
  };
  const id = setInterval(() => {
    void tick();
  }, intervalMs);
  id.unref?.();
}

export function onRequestError(
  error: unknown,
  request: Readonly<{
    path: string;
    method: string;
    headers: Record<string, string | string[] | undefined>;
  }>,
  context: Readonly<{
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "proxy";
    renderSource?:
      | "react-server-components"
      | "react-server-components-payload"
      | "server-rendering";
    revalidateReason: "on-demand" | "stale" | undefined;
  }>,
): void {
  const line = `[request:${context.routeType}] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;
  const meta = `{"method":"${request.method}","path":"${request.path}","routePath":"${context.routePath}"}`;

  // В Edge файловых логов нет, поэтому только консоль — и без импорта логгера,
  // который протащил бы node:fs в Edge-бандл.
  const ts = new Date().toISOString();
  console.error(`[${ts}] [error] request:${context.routeType}: ${line} ${meta}`);
}