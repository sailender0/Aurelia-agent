import { createFileRoute, Outlet, Link, useRouter, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { LayoutDashboard, Users, Building2, BarChart3, LogOut, Calendar, Shield, Activity, MessageSquare, Menu } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({ component: AuthLayout });

function hasAny(roles: AppRole[], wanted: AppRole[]) {
  return roles.some((r) => wanted.includes(r));
}

function AuthLayout() {
  const { user, loading, roles, signOut } = useAuth();
  const router = useRouter();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

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
    { to: "/signals", label: "Activity Signals", icon: Activity, show: true },
    { to: "/admin", label: "Admin", icon: Shield, show: hasAny(roles, ["admin"]) },
    { to: "/teams", label: "Teams Bot", icon: MessageSquare, show: hasAny(roles, ["admin"]) },
  ];

  const navItems = nav.filter((n) => n.show);

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="space-y-1 p-3">
      {navItems.map((n) => {
        const active = location.pathname === n.to;
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
              active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
            }`}
          >
            <n.icon className="h-4 w-4" /> {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const Brand = () => (
    <div className="flex h-16 items-center gap-2 border-b border-border px-6">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-[image:var(--gradient-hero)] text-primary-foreground font-bold">A</div>
      <span className="font-semibold">Aurelia</span>
    </div>
  );

  const Footer = () => (
    <div className="border-t border-border p-3">
      <div className="mb-2 truncate px-3 text-xs text-muted-foreground">{user.email}</div>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => signOut().then(() => router.navigate({ to: "/" }))}>
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <Brand />
        <div className="flex-1 overflow-auto"><NavList /></div>
        <Footer />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-border bg-card px-4 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Brand />
              <NavList onNavigate={() => setMobileOpen(false)} />
              <Footer />
            </SheetContent>
          </Sheet>
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[image:var(--gradient-hero)] text-primary-foreground text-sm font-bold">A</div>
          <span className="font-semibold">Aurelia</span>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
