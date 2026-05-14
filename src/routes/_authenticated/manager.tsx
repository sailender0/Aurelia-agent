import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/manager")({ component: ManagerPage });

function ManagerPage() {
  const { user } = useAuth();
  const [pending, setPending] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);

  async function load() {
    const { data: t } = await supabase.from("profiles").select("*").eq("manager_id", user!.id);
    setTeam(t ?? []);
    const ids = (t ?? []).map((x) => x.id);
    if (ids.length === 0) { setPending([]); return; }
    const { data: ts } = await supabase.from("draft_timesheets").select("*, profiles!inner(display_name)").in("user_id", ids).eq("status", "submitted");
    setPending(ts ?? []);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [user?.id]);

  async function decide(id: string, decision: "approved" | "rejected") {
    const { error: e1 } = await supabase.from("draft_timesheets").update({ status: decision }).eq("id", id);
    if (e1) return toast.error(e1.message);
    await supabase.from("timesheet_approvals").insert({ timesheet_id: id, manager_id: user!.id, decision });
    toast.success(`Timesheet ${decision}`);
    void load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Team console</h1>

      <Card>
        <CardHeader><CardTitle>Pending approvals · {pending.length}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 && <p className="text-sm text-muted-foreground">All clear.</p>}
          {pending.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <div className="font-medium">{t.profiles?.display_name}</div>
                <div className="text-xs text-muted-foreground">Week of {t.week_start} · confidence {((t.ai_confidence ?? 0) * 100).toFixed(0)}%</div>
                <p className="mt-1 text-sm text-muted-foreground">{t.ai_summary}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => decide(t.id, "rejected")}>Reject</Button>
                <Button size="sm" onClick={() => decide(t.id, "approved")}>Approve</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Direct reports · {team.length}</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {team.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-3 text-sm">
                <div>{p.display_name}</div>
                <Badge variant="outline">{p.employment_type}</Badge>
              </div>
            ))}
            {team.length === 0 && <p className="text-sm text-muted-foreground">No reports assigned yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
