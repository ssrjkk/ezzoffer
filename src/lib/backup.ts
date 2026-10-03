import { db } from "./db";
import { logInfo } from "./logger";
import { mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_BACKUPS = 7;

export function startBackupScheduler(): void {
  const run = () => {
    try {
      const dbPath = process.env.EZOFFER_DB_PATH ?? "./data/ezoffer.db";
      const backupDir = `${dbPath}.backups`;

      if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = join(backupDir, `ezoffer-${timestamp}.db`);

      db.prepare("VACUUM INTO ?").run(backupPath);

      const files = readdirSync(backupDir).filter((f: string) => f.endsWith(".db")).sort();
      while (files.length > MAX_BACKUPS) {
        const oldest = files.shift();
        if (oldest) unlinkSync(join(backupDir, oldest));
      }

      logInfo("backup", `Бэкап создан: ${backupPath}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      logInfo("backup", `Ошибка бэкапа: ${msg}`);
    }
  };

  setTimeout(run, 60_000);
  setInterval(run, BACKUP_INTERVAL_MS);
}