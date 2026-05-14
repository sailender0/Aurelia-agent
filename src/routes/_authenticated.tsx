import { createFileRoute, Outlet, Link, useRouter, useLocation } from "@tanstack/react-router";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutDashboard, Users, Building2, BarChart3, LogOut, Calendar } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({ component: AuthLayout });

function hasAny(roles: AppRole[], wanted: AppRole[]) {
  return roles.some((r) => wanted.includes(r));
}

function AuthLayout() {
  const { user, loading, roles, signOut } = useAuth();
  const router = useRouter();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!user) {
    if (typeof window !== "undefined") router.navigate({ to: "/login" });
    return null;
  }

  const nav = [
    { to: "/dashboard", label: "My Dashboard", icon: LayoutDashboard, show: true },
    { to: "/timesheet", label: "Weekly Timesheet", icon: Calendar, show: true },
    { to: "/manager", label: "Team", icon: Users, show: hasAny(roles, ["manager", "admin"]) },
    { to: "/hr", label: "HR Console", icon: Building2, show: hasAny(roles, ["hr", "admin"]) },
    { to: "/exec", label: "Executive", icon: BarChart3, show: hasAny(roles, ["executive", "admin"]) },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:block">
        <div className="flex h-16 items-center gap-2 border-b border-border px-6">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[image:var(--gradient-hero)] text-primary-foreground font-bold">A</div>
          <span className="font-semibold">Aurelia</span>
        </div>
        <nav className="space-y-1 p-3">
          {nav.filter((n) => n.show).map((n) => {
            const active = location.pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
                }`}
              >
                <n.icon className="h-4 w-4" /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-4 w-64 px-3">
          <div className="mb-2 truncate px-3 text-xs text-muted-foreground">{user.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => signOut().then(() => router.navigate({ to: "/" }))}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
