import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getManagerOverview, decideTimesheet } from "@/lib/manager.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, RefreshCw, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manager")({ component: ManagerPage });

type Pending = {
  id: string;
  user_id: string;
  week_start: string;
  ai_summary: string | null;
  ai_confidence: number | null;
  display_name: string;
};
type Member = { id: string; display_name: string; employment_type: string | null };
type Session = {
  user_id: string;
  status: "open" | "closed" | "void";
  check_in_time: string;
  check_out_time: string | null;
};

function ManagerPage() {
  const fetchOverview = useServerFn(getManagerOverview);
  const decide = useServerFn(decideTimesheet);

  const [pending, setPending] = useState<Pending[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const r = await fetchOverview();
      setTeam(r.team as Member[]);
      setPending(r.pending as Pending[]);
      setSessions(r.sessions as Session[]);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load team data");
    } finally {
      setIsLoading(false);
    }
  }, [fetchOverview]);

  useEffect(() => { void load(); }, [load]);

  async function onDecide(id: string, decision: "approved" | "rejected") {
    try {
      await decide({ data: { timesheetId: id, decision } });
      toast.success(`Timesheet ${decision}`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to process decision");
    }
  }

  const sessionByUser = new Map(sessions.map((s) => [s.user_id, s] as const));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Team console</h1>
        <Button variant="ghost" size="icon" onClick={() => void load()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Card className="border-primary/20 shadow-md">
        <CardHeader className="bg-primary/5">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-primary">
            Pending approvals · {pending.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {isLoading && (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
          {!isLoading && pending.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="mb-3 h-10 w-10 text-green-500/40" />
              <p className="text-sm font-medium text-muted-foreground">All caught up.</p>
            </div>
          )}
          {pending.map((t) => (
            <div key={t.id} className="flex flex-col gap-4 rounded-xl border border-border p-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  {t.display_name}
                  <Badge variant="secondary" className="text-[10px]">
                    {Math.round((t.ai_confidence ?? 0) * 100)}% AI score
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Week of {new Date(t.week_start).toLocaleDateString(undefined, { dateStyle: "long" })}
                </div>
                {t.ai_summary && (
                  <p className="max-w-md text-sm text-muted-foreground border-l-2 border-primary/20 pl-3 mt-2 py-1">
                    {t.ai_summary}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="hover:bg-destructive/10 hover:text-destructive" onClick={() => onDecide(t.id, "rejected")}>
                  <XCircle className="mr-2 h-4 w-4" /> Reject
                </Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 shadow-sm" onClick={() => onDecide(t.id, "approved")}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Direct reports · {team.length}</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {team.map((p) => {
              const s = sessionByUser.get(p.id);
              const status =
                s?.status === "open" ? "Working" :
                s?.status === "closed" ? "Checked out" : "Off";
              return (
                <div key={p.id} className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                      {p.display_name?.charAt(0).toUpperCase() ?? "E"}
                    </div>
                    <div>
                      <div className="font-semibold">{p.display_name}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {p.employment_type?.replace("_", " ") ?? "Employee"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {s && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(s.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {s.check_out_time && ` → ${new Date(s.check_out_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                      </span>
                    )}
                    <Badge variant={s?.status === "open" ? "default" : "outline"}>{status}</Badge>
                  </div>
                </div>
              );
            })}
            {team.length === 0 && !isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground italic">
                No direct reports under your management.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
