import type { Vacancy } from "./vacancies/types";

export type ScoredVacancy = {
  vacancy: Vacancy;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
};

const SKILL_KEYWORDS = [
  "react", "typescript", "javascript", "next.js", "nextjs", "vue", "angular",
  "node.js", "nodejs", "python", "django", "flask", "fastapi", "java", "spring",
  "kotlin", "swift", "flutter", "react native", "golang", "rust", "c++", "c#",
  "sql", "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
  "docker", "kubernetes", "aws", "gcp", "azure", "terraform",
  "ci/cd", "jenkins", "github actions", "gitlab",
  "html", "css", "sass", "less", "tailwind",
  "redux", "mobx", "zustand", "recoil",
  "graphql", "rest", "websocket", "grpc",
  "linux", "unix", "bash", "shell",
  "git", "svn",
  "figma", "sketch", "photoshop", "illustrator",
  "jira", "confluence", "trello", "asana",
  "agile", "scrum", "kanban",
  "unit", "integration", "e2e", "cypress", "playwright", "selenium",
  "machine learning", "deep learning", "nlp", "computer vision",
  "data science", "data analysis", "pandas", "numpy", "scikit-learn",
  "tableau", "power bi", "looker",
  "salesforce", "sap", "1c",
  "excel", "google sheets",
  "writing", "copywriting", "editing",
  "marketing", "seo", "sem", "smm", "ppc",
  "sales", "b2b", "b2c", "lead generation",
  "recruiting", "hr", "talent acquisition",
  "finance", "accounting", "auditing", "tax",
  "legal", "compliance", "contract",
  "project management", "product management", "program management",
  "customer support", "technical support", "help desk",
  "teaching", "training", "coaching", "mentoring",
  "design", "ux", "ui", "user research", "usability",
  "mobile", "ios", "android", "desktop",
  "embedded", "firmware", "hardware",
  "networking", "security", "penetration testing", "soc",
  "blockchain", "web3", "smart contracts",
  "game development", "unity", "unreal engine",
  "video", "animation", "motion design",
  "photography", "audio", "music",
  "real estate", "construction", "architecture",
  "logistics", "supply chain", "procurement",
  "healthcare", "medicine", "pharmaceuticals",
  "education", "e-learning", "lms",
  "hospitality", "tourism", "events",
  "retail", "e-commerce", "marketplace",
  "insurance", "banking", "investment",
  "telecommunications", "iot", "5g",
  "automotive", "aerospace", "energy",
  "agriculture", "food", "beverage",
  "media", "entertainment", "sports",
  "non-profit", "government", "public sector",
];

function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const skill of SKILL_KEYWORDS) {
    if (lower.includes(skill)) {
      found.push(skill);
    }
  }
  return found;
}

function extractExperienceYears(text: string): number {
  const patterns = [
    /(\d+)\s*(?:лет|years|года|год)/i,
    /(\d+)\s*\+\s*(?:лет|years)/i,
    /опыт\s*(?:работы\s*)?(\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const years = parseInt(match[1], 10);
      if (years >= 0 && years <= 50) return years;
    }
  }
  return 0;
}

function extractLevel(text: string): string {
  const lower = text.toLowerCase();
  if (/(senior|ведущ|старш|lead|principal|director|head|руководит|главн)/.test(lower)) return "Senior";
  if (/(middle|мидл|миддл)/.test(lower)) return "Middle";
  if (/(junior|младш|джун|стаж|intern)/.test(lower)) return "Junior";
  return "Middle";
}

export function scoreVacancyForResume(
  vacancy: Vacancy,
  resumeContent: string,
  resumeTitle: string,
): ScoredVacancy {
  const resumeSkills = extractSkills(`${resumeTitle} ${resumeContent}`);
  const vacancySkills = extractSkills(`${vacancy.title} ${vacancy.about} ${vacancy.requirements.join(" ")}`);

  const matchedSkills = resumeSkills.filter((skill) => vacancySkills.includes(skill));
  const missingSkills = vacancySkills.filter((skill) => !resumeSkills.includes(skill));

  const skillScore = vacancySkills.length > 0
    ? (matchedSkills.length / vacancySkills.length) * 60
    : 30;

  const resumeLevel = extractLevel(resumeTitle);
  const vacancyLevel = extractLevel(vacancy.title);
  const levelScore = resumeLevel === vacancyLevel ? 20 : 10;

  const resumeYears = extractExperienceYears(resumeContent);
  const vacancyYears = extractExperienceYears(vacancy.about);
  const expScore = resumeYears >= vacancyYears ? 20 : Math.max(0, 20 - (vacancyYears - resumeYears) * 5);

  const totalScore = Math.round(skillScore + levelScore + expScore);

  return {
    vacancy,
    score: Math.min(100, Math.max(0, totalScore)),
    matchedSkills,
    missingSkills,
  };
}

export function rankVacanciesForResume(
  vacancies: Vacancy[],
  resumeContent: string,
  resumeTitle: string,
): ScoredVacancy[] {
  return vacancies
    .map((v) => scoreVacancyForResume(v, resumeContent, resumeTitle))
    .sort((a, b) => b.score - a.score);
}

/**
 * Ранжирует письма по совпадению навыков с вакансией, чтобы выбрать одно
 * лучшее вместо отправки всех подряд. Детерминированно: ничьи решает порядок.
 */
export function rankLettersForVacancy(
  letters: { id: number; content: string }[],
  vacancy: Vacancy,
): { id: number; content: string; score: number }[] {
  const vacancySkills = new Set(
    extractSkills(`${vacancy.title} ${vacancy.about} ${vacancy.requirements.join(" ")}`),
  );
  return letters
    .map((letter) => {
      const letterSkills = extractSkills(letter.content);
      const overlap = letterSkills.filter((s) => vacancySkills.has(s)).length;
      // Небольшой бонус за длину: развёрнутое письмо обычно лучше, но не важнее совпадения навыков.
      const score = overlap * 10 + Math.min(5, Math.floor(letter.content.length / 400));
      return { ...letter, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function getRecommendations(
  resumeContent: string,
  resumeTitle: string,
  topVacancies: ScoredVacancy[],
): string[] {
  const recommendations: string[] = [];

  const allMissingSkills = new Set<string>();
  for (const sv of topVacancies.slice(0, 10)) {
    for (const skill of sv.missingSkills) {
      allMissingSkills.add(skill);
    }
  }

  if (allMissingSkills.size > 0) {
    const topMissing = [...allMissingSkills].slice(0, 5);
    recommendations.push(`Добавьте в резюме навыки: ${topMissing.join(", ")}`);
  }

  const resumeYears = extractExperienceYears(resumeContent);
  if (resumeYears < 3) {
    recommendations.push("Укажите конкретные достижения с цифрами в опыте работы");
  }

  if (!resumeContent.toLowerCase().includes("github") && !resumeContent.toLowerCase().includes("gitlab")) {
    recommendations.push("Добавьте ссылку на GitHub/GitLab с проектами");
  }

  if (resumeContent.length < 500) {
    recommendations.push("Расширьте описание опыта — более подробные резюме получают больше откликов");
  }

  if (!resumeContent.toLowerCase().includes("английский") && !resumeContent.toLowerCase().includes("english")) {
    recommendations.push("Укажите уровень английского языка");
  }

  return recommendations;
}