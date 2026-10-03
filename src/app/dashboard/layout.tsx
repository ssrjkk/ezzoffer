import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPlanActive, planDailyLimit, planLabel, daysLeft } from "@/lib/plans";
import { DashboardNav } from "@/components/dashboard/nav";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ErrorBoundary } from "@/components/dashboard/error-boundary";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const active = isPlanActive(user);
  const nav = {
    name: user.name,
    email: user.email,
    planLabel: planLabel(user),
    planActive: active,
    planDays: daysLeft(user),
    planLimit: active ? planDailyLimit(user.plan) : 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <aside className="hidden lg:flex lg:flex-col lg:w-72 lg:fixed lg:inset-y-0">
        <div className="sticky top-0">
          <DashboardNav {...nav} />
        </div>
      </aside>
      <div className="flex-1 lg:pl-72">
        <main className="min-h-screen p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6 lg:hidden">
              <DashboardNav {...nav} onMobile />
            </div>
            <div className="mb-6 hidden lg:block">
              <QuickActions active={active} />
            </div>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
