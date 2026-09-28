import Link from "next/link";
import { jobs, type Job } from "@/lib/data";
import { LevelPill } from "@/components/home/jobs-preview";

function JobCard({ job }: { job: Job }) {
  return (
    <Link
      href={`/jobs/${job.slug}`}
      className="group flex h-full flex-col rounded-3xl border border-line bg-surface/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-accent/25 to-accent-2/20 text-sm font-bold ring-1 ring-white/10">
          {job.company.slice(0, 2)}
        </span>
        <LevelPill level={job.level} />
      </div>
      <p className="mt-4 text-base font-semibold leading-snug">{job.title}</p>
      <p className="mt-1.5 text-sm text-muted">{job.company}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        <span className="text-sm font-semibold text-success">{job.salary}</span>
        <span className="text-sm text-muted">·</span>
        <span className="text-sm text-muted">{job.format}</span>
        <span className="text-sm text-muted">·</span>
        <span className="text-sm text-muted">{job.city}</span>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
        <span className="text-xs text-muted">{job.category}</span>
        <span className="inline-flex items-center gap-1 text-xs text-accent-2">
          {job.posted}
          <span className="inline-flex size-1.5 rounded-full bg-success animate-pulse-dot" />
        </span>
      </div>
    </Link>
  );
}

export function JobsGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {jobs.map((job) => (
        <JobCard key={job.slug} job={job} />
      ))}
    </div>
  );
}