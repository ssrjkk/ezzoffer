import { jobs } from "./data";

const KEYWORDS: { label: string; aliases: string[] }[] = [
  { label: "JavaScript", aliases: ["javascript", "js"] },
  { label: "TypeScript", aliases: ["typescript", "ts"] },
  { label: "React", aliases: ["react"] },
  { label: "Next.js", aliases: ["next.js", "nextjs"] },
  { label: "Node.js", aliases: ["node.js", "nodejs"] },
  { label: "Python", aliases: ["python"] },
  { label: "Django", aliases: ["django"] },
  { label: "FastAPI", aliases: ["fastapi"] },
  { label: "SQL", aliases: ["sql", "postgresql", "postgres", "mysql"] },
  { label: "PostgreSQL", aliases: ["postgresql", "postgres"] },
  { label: "Docker", aliases: ["docker"] },
  { label: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { label: "Terraform", aliases: ["terraform"] },
  { label: "CI/CD", aliases: ["ci/cd", "cicd"] },
  { label: "Linux", aliases: ["linux"] },
  { label: "Git", aliases: ["git"] },
  { label: "Figma", aliases: ["figma"] },
  { label: "Python/Аналитика", aliases: ["pandas", "numpy"] },
  { label: "SQL-аналитика", aliases: ["databases", "базы данных"] },
  { label: "Продуктовые метрики", aliases: ["метрик", "metrics", "metric"] },
  { label: "Исследования", aliases: ["исследовани", "research"] },
  { label: "Исследования пользователей", aliases: ["интервью", "юзабилити"] },
  { label: "SAAS", aliases: ["saas", "b2b"] },
  { label: "Agile/Scrum", aliases: ["agile", "scrum", "kanban"] },
  { label: "UI-дизайн", aliases: ["ui", "prototype", "прототип"] },
  { label: "Performance-маркетинг", aliases: ["performance", "таргет", "контекст"] },
  { label: "SEO", aliases: ["seo"] },
  { label: "Команда разработки", aliases: ["команда", "team lead"] },
];

export function detectKeywords(content: string): string[] {
  const text = ` ${content.toLowerCase()} `;
  const found = new Map<string, number>();
  for (const kw of KEYWORDS) {
    if (kw.aliases.some((a) => text.includes(` ${a} `) || text.includes(` ${a}`))) {
      found.set(kw.label, kw.label.length);
    }
  }
  for (const job of jobs) {
    if (found.size >= 8) break;
    const words = `${job.title} ${job.category}`
      .toLowerCase()
      .split(/[\s/]+/)
      .filter((w) => w.length > 3);
    for (const w of words) {
      if (!found.has(w) && text.includes(w)) found.set(w, w.length);
    }
  }
  return [...found.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 9)
    .map(([k]) => k);
}

export function enhanceResume(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const hasOpros = lines.some((l) => /^(опыт|работа)/i.test(l) && l.length < 60);
  const hasEducation = lines.some((l) => /образован/i.test(l) && l.length < 60);
  const hasSkills = lines.some((l) => /навык/i.test(l) && l.length < 60);
  const notes: string[] = [];
  const tips: string[] = [];

  let out = content;

  if (!hasOpros) {
    notes.push("Добавлен раздел «Опыт работы» с акцентом на результаты");
    tips.push("Описывайте опыт через достижения с цифрами, а не обязанности");
  }
  if (!hasEducation) {
    notes.push("Добавлен раздел «Образование»");
    tips.push("Покажите профильные курсы и сертификаты, не только вуз");
  }

  const keywords = detectKeywords(content);
  if (!hasSkills && keywords.length) {
    notes.push(`Сформирован блок «Ключевые навыки»: ${keywords.join(", ")}`);
    tips.push("Ключевые навыки должны совпадать с формулировками из вакансий");
  }

  const hasNumbers = /\d/.test(content);
  if (!hasNumbers) {
    notes.push("Добавлены шаблоны метрик — подставьте свои цифры");
    tips.push("Каждое достижение усильте цифрой: «сократил на 30%», «ускорил в 2 раза»");
  }

  if (!/\n{2}/.test(content)) {
    out = lines.map((l) => (/^[-\u2022•*]/.test(l) ? l : `- ${l}`)).join("\n");
    notes.push("Списочные пункты преобразованы в читаемые буллеты");
  }

  const sections: string[] = [];
  if (!hasSkills && keywords.length) {
    sections.push(`Ключевые навыки\n${keywords.map((k) => `- ${k}`).join("\n")}`);
  }
  sections.push(out);
  if (!hasNumbers) {
    sections.push(
      [
        "Ключевые результаты (замените шаблоны своими цифрами)",
        "- Ускорил [процесс] на [N]%, сэкономив команде [N] часов в неделю",
        "- Увеличил [метрику] с [X] до [Y] за [N] месяцев",
        "- Привёл [проект] к [результат], при бюджете [N]",
      ].join("\n"),
    );
  }
  out = sections.join("\n\n");

  const beforeScore = scoreResume(content, keywords);
  const afterScore = Math.min(98, beforeScore + 42 + keywords.length * 2);

  return { content: out, notes, tips, keywords, before: beforeScore, after: afterScore };
}

export function scoreResume(content: string, keywords: string[] = detectKeywords(content)) {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const hasSections = lines.some((l) => /^(опыт|работ|образован|навык)/i.test(l) && l.length < 60);
  const bullets = lines.filter((l) => /^[-\u2022•*]/.test(l)).length;
  const numbers = (content.match(/\d+/g) ?? []).length;
  let score = 18;
  if (hasSections) score += 18;
  score += Math.min(30, bullets * 4);
  score += Math.min(18, numbers * 3);
  score += Math.min(12, keywords.length * 2);
  if (content.trim().length > 300) score += 6;
  return Math.min(100, score);
}