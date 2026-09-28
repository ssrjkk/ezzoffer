import { logError } from "@/lib/logger";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("unhandledRejection", (reason) => {
      logError("process:unhandledRejection", reason instanceof Error ? reason : new Error(String(reason)));
    });

    // Реальный планировщик: автоотклики, обновление каталога, синхронизация hh, дневные отчёты.
    const intervalMs = Number(process.env.SCHEDULER_INTERVAL_MS ?? 5 * 60 * 1000);
    if (Number.isFinite(intervalMs) && intervalMs >= 60_000) {
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
  }
}

export function onRequestError(
  error: unknown,
  request: Readonly<{
    path: string;
    method: string;
    headers: NodeJS.Dict<string | string[]>;
  }>,
  context: Readonly<{
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "proxy";
    renderSource?: "react-server-components" | "react-server-components-payload" | "server-rendering";
    revalidateReason: "on-demand" | "stale" | undefined;
  }>,
): void {
  logError(
    `request:${context.routeType}`,
    error instanceof Error ? error : new Error(String(error)),
    { method: request.method, path: request.path, routePath: context.routePath },
  );
}