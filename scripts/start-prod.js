/**
 * Локальный production-запуск standalone-сборки (как в Dockerfile).
 * Копирует .next/static и public в .next/standalone и запускает сервер.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("Сборка не найдена. Сначала выполните: npm run build");
  process.exit(1);
}

mkdirSync(path.join(standalone, ".next"), { recursive: true });
if (existsSync(path.join(root, ".next", "static"))) {
  cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
    recursive: true,
  });
}
if (existsSync(path.join(root, "public"))) {
  cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}

// Шрифт с кириллицей для PDF-экспорта: путь к нему вычисляется в рантайме,
// поэтому Turbopack не может его отследить, и копируем вручную — так же, как
// в Dockerfile. Без него экспорт резюме в PDF вернёт 503.
const FONT_FILES = ["DejaVuSans.ttf", "DejaVuSansCondensed.ttf"];
const fontSrc = path.join(root, "node_modules", "dejavu-fonts-ttf", "ttf");
const fontDst = path.join(standalone, "node_modules", "dejavu-fonts-ttf", "ttf");
const missingFonts = FONT_FILES.filter((f) => !existsSync(path.join(fontSrc, f)));
if (missingFonts.length > 0) {
  console.warn(
    `Внимание: не найдены файлы шрифта (${missingFonts.join(", ")}). PDF-экспорт вернёт ошибку. Установите пакет dejavu-fonts-ttf.`,
  );
} else {
  mkdirSync(fontDst, { recursive: true });
  for (const file of FONT_FILES) {
    cpSync(path.join(fontSrc, file), path.join(fontDst, file));
  }
}

const env = {
  ...process.env,
  NODE_ENV: "production",
  HOSTNAME: process.env.HOSTNAME ?? "0.0.0.0",
  PORT: process.env.PORT ?? "3000",
};

console.log(`EZOffer запускается на http://localhost:${env.PORT} (standalone)`);
const child = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  env,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));