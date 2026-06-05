import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, PlayCircle, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { mondayOf, fmtHours } from "@/lib/week";
import { teamsNotifyMyEvent } from "@/lib/teams.functions";
import { GithubStatsCard } from "@/components/github-stats-card";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Dashboard() {
  const { user, roles } = useAuth();
  const notify = useServerFn(teamsNotifyMyEvent);
  const [active, setActive] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("work_sessions")
      .select("*")
      .eq("user_id", user!.id)
      .order("check_in", { ascending: false })
      .limit(10);
    setHistory(data ?? []);
    setActive((data ?? []).find((s) => !s.check_out) ?? null);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [user?.id]);

  async function checkIn() {
    setLoading(true);
    const { error } = await supabase.from("work_sessions").insert({ user_id: user!.id });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Checked in");
    notify({ data: { event: "check_in" } }).catch(() => {});
    void load();
  }
  async function checkOut() {
    if (!active) return;
    setLoading(true);
    const { error } = await supabase.from("work_sessions").update({ check_out: new Date().toISOString() }).eq("id", active.id);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Checked out");
    notify({ data: { event: "check_out" } }).catch(() => {});
    void load();
  }

  const weekHours = history.reduce((s, x) => s + (x.check_out ? (new Date(x.check_out).getTime() - new Date(x.check_in).getTime()) / 3.6e6 : 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">{user?.email} · {roles.join(", ") || "employee"}</p>
        </div>
        <Link to="/timesheet" search={{ week: mondayOf() }}><Button variant="outline">Open weekly timesheet</Button></Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Status</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant={active ? "default" : "secondary"}>{active ? "Checked in" : "Off the clock"}</Badge>
            </div>
            <div className="mt-4">
              {active ? (
                <Button onClick={checkOut} disabled={loading} variant="destructive"><StopCircle className="mr-2 h-4 w-4" />Check out</Button>
              ) : (
                <Button onClick={checkIn} disabled={loading}><PlayCircle className="mr-2 h-4 w-4" />Check in</Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">This week</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{fmtHours(weekHours)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Sessions logged</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{history.length}</div></CardContent>
        </Card>
      </div>

      <GithubStatsCard />


      <Card>
        <CardHeader><CardTitle>Recent attendance</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {history.map((s) => {
              const dur = s.check_out ? (new Date(s.check_out).getTime() - new Date(s.check_in).getTime()) / 3.6e6 : 0;
              return (
                <div key={s.id} className="flex items-center justify-between py-3 text-sm">
                  <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />{new Date(s.check_in).toLocaleString()}</div>
                  <div className="text-muted-foreground">{s.check_out ? `→ ${new Date(s.check_out).toLocaleTimeString()} · ${fmtHours(dur)}` : "Active"}</div>
                </div>
              );
            })}
            {history.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No sessions yet — check in to get started.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
