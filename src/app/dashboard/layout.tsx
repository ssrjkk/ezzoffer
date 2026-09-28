import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPlanActive, planDailyLimit, planLabel, daysLeft } from "@/lib/plans";
import { DashboardNav } from "@/components/dashboard/nav";

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
    <div className="container-x flex-1 py-8 lg:py-10">
      <div className="flex gap-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24">
            <DashboardNav {...nav} />
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="mb-6 lg:hidden">
            <DashboardNav {...nav} onMobile />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}