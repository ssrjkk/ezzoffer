import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Автономная сборка для простого деплоя (VPS/Docker): .next/standalone
  output: "standalone",
  // Шрифт с кириллицей для PDF-экспорта резюме НЕ добавляется через
  // outputFileTracingIncludes: Turbopack при таком включении разворачивает в
  // трассировку весь проект (исходники, тесты) — standalone раздувался с 36 до
  // 47 МБ. Вместо этого файл копируется в образ явно в Dockerfile и правится
  // вручную при ручном деплое (см. README, раздел «Деплой»).
  // Путь к SQLite вычисляется в рантайме, поэтому file tracing считает его
  // динамическим и тянет в образ локальную ./data — вместе с ezoffer.db
  // (хэши паролей, OAuth-токены) и бэкапами. Каталог создаётся при старте,
  // поэтому в образе ему не место: данные приходят из volume.
  outputFileTracingExcludes: {
    "/*": ["data/**/*"],
    "instrumentation": ["data/**/*"],
    "middleware": ["data/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;