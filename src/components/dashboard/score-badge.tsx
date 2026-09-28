import { scoreResume } from "@/lib/resume-enhance";

export function ScoreBadge({ content }: { content: string }) {
  const score = scoreResume(content);
  const tone = score >= 70 ? "success" : score >= 45 ? "warn" : "danger";
  const cls = {
    success: "border-success/30 bg-success/10 text-success",
    warn: "border-warn/30 bg-warn/10 text-warn",
    danger: "border-red-400/30 bg-red-400/10 text-red-300",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${cls}`}>
      ATS {score}
    </span>
  );
}