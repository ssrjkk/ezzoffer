import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EZOffer — поиск работы без стресса и отказов",
    short_name: "EZOffer",
    description: "Подбор вакансий по резюме, автоотклик с сопроводительным письмом и уведомления в Telegram.",
    start_url: "/",
    display: "standalone",
    background_color: "#06060b",
    theme_color: "#7c5cff",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}