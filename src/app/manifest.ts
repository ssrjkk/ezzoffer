import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EZOffer — поиск работы без стресса и отказов",
    short_name: "EZOffer",
    description: "AI-агент для поиска работы: резюме, вакансии и автоотклики.",
    start_url: "/",
    display: "standalone",
    background_color: "#06060b",
    theme_color: "#7c5cff",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}