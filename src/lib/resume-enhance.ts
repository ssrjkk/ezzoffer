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

/**
 * Детект ключевых навыков.
 *
 * Совпадение ищется по границам слова: раньше проверка была
 * `text.includes(` ${a} `) || text.includes(` ${a}`)` — второй вариант срабатывал
 * на ЛЮБОЕ слово, начинающееся с алиаса. «Работа с JavaScriptCore» давал
 * «JavaScript», а «реактивность» — «React», и в резюме появлялись навыки,
 * которых там нет. Для ATS-скоринга это прямой вред: подставленные навыки
 * не соответствуют реальному опыту кандидата.
 *
 * Теперь алиас матчится только как отдельное слово (\\b), с поддержкой
 * кириллицы и дефисов вроде «ci/cd».
 */
function hasWord(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zA-Zа-яА-ЯёЁ0-9])${escaped}($|[^a-zA-Zа-яА-ЯёЁ0-9])`, "iu").test(text);
}

export function detectKeywords(content: string): string[] {
  const text = ` ${content.toLowerCase()} `;
  const found = new Map<string, number>();
  for (const kw of KEYWORDS) {
    if (kw.aliases.some((a) => hasWord(text, a))) {
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
      if (!found.has(w) && hasWord(text, w)) found.set(w, w.length);
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

  // «После» считается заново по ИТОГОВОМУ тексту, а не выдумывается.
  //
  // Раньше здесь стояло `Math.min(98, beforeScore + 42 + keywords.length * 2)` —
  // формула, которая гарантированно выдавала балл выше исходного и упиралась
  // в 98. Пользователь видел «ATS: 34 → 92» независимо от того, что реально
  // изменилось в резюме. Это ложь в интерфейсе: показатель не измерял
  // качество текста, а просто сообщал, что «улучшение сработало».
  //
  // Теперь после — это scoreResume итогового текста по той же функции, что и
  // «до». Рост обеспечивают реальные добавления (раздел навыков, буллеты,
  // шаблон метрик), и он может быть нулевым, если улучшать нечего.
  const afterKeywords = detectKeywords(out);
  const afterScore = scoreResume(out, afterKeywords);

  return { content: out, notes, tips, keywords, before: beforeScore, after: afterScore };
}

/**
 * Заголовок раздела распознаётся и с маркером списка.
 *
 * Регрессия: enhanceResume превращает все строки в буллеты («- Опыт работы»),
 * а проверка /^(опыт|работ|...)/ к такой строке не подходила. В итоге раздел
 * переставал засчитываться в балле, хотя его только что добавили, и
 * улучшенное резюме получало оценку НИЖЕ исходного.
 */
function isSectionHeader(line: string): boolean {
  if (line.length >= 60) return false;
  const bare = line.replace(/^[-•*•]\s*/, "").trim();
  return /^(опыт|работ|образован|навык|проект|контакт)/i.test(bare);
}

function isBullet(line: string): boolean {
  return /^[-•*•]/.test(line);
}

export function scoreResume(content: string, keywords: string[] = detectKeywords(content)) {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const hasSections = lines.some(isSectionHeader);
  const bullets = lines.filter(isBullet).length;

  const numbers = (content.match(/\d+/g) ?? []).length;
  let score = 18;
  if (hasSections) score += 18;
  score += Math.min(30, bullets * 4);
  score += Math.min(18, numbers * 3);
  score += Math.min(12, keywords.length * 2);
  if (content.trim().length > 300) score += 6;
  return Math.min(100, score);
}