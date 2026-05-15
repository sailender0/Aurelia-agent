import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manager")({ component: ManagerPage });

function ManagerPage() {
  const { user } = useAuth();
  const [pending, setPending] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    try {
      // 1. Fetch all direct reports
      const { data: t } = await supabase
        .from("profiles")
        .select("*")
        .eq("manager_id", user!.id);
      
      setTeam(t ?? []);
      
      const ids = (t ?? []).map((x) => x.id);
      if (ids.length === 0) {
        setPending([]);
        return;
      }

      // 2. Fetch timesheets strictly with 'submitted' status for those reports
      const { data: ts } = await supabase
        .from("draft_timesheets")
        .select("*, profiles!inner(display_name)")
        .in("user_id", ids)
        .eq("status", "submitted");
      
      setPending(ts ?? []);
    } catch (error) {
      console.error("Error loading manager data:", error);
      toast.error("Failed to load team data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (user?.id) {
      void load();
    }
  }, [user?.id]);

  async function decide(id: string, decision: "approved" | "rejected") {
    const { error: e1 } = await supabase
      .from("draft_timesheets")
      .update({ status: decision })
      .eq("id", id);

    if (e1) return toast.error(e1.message);

    await supabase.from("timesheet_approvals").insert({
      timesheet_id: id,
      manager_id: user!.id,
      decision
    });

    toast.success(`Timesheet ${decision}`);
    void load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Team console</h1>
        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>

      {/* SECTION 1: ACTIONABLE ITEMS */}
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="bg-primary/5">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-primary">
            Pending approvals · {pending.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {pending.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="mb-2 h-8 w-8 text-green-500/50" />
              <p className="text-sm text-muted-foreground">All timesheets are processed. Great job!</p>
            </div>
          )}
          
          {pending.map((t) => (
            <div key={t.id} className="flex flex-col gap-4 rounded-lg border border-border p-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold">
                  {t.profiles?.display_name}
                  <Badge variant="secondary" className="text-[10px]">
                    {((t.ai_confidence ?? 0) * 100).toFixed(0)}% AI Match
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Period: Week of {new Date(t.week_start).toLocaleDateString()}
                </div>
                <p className="max-w-md text-sm text-muted-foreground italic">"{t.ai_summary}"</p>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="text-destructive hover:bg-destructive/5"
                  onClick={() => decide(t.id, "rejected")}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
                <Button 
                  size="sm" 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => decide(t.id, "approved")}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approve
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* SECTION 2: TEAM OVERVIEW */}
      <Card>
        <CardHeader>
          <CardTitle>Direct reports · {team.length}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {team.map((p) => {
              const hasPending = pending.some(item => item.user_id === p.id);
              
              return (
                <div key={p.id} className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center font-medium text-xs">
                      {p.display_name?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium">{p.display_name}</div>
                      <div className="text-xs text-muted-foreground lowercase">{p.employment_type}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {hasPending && (
                      <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" title="Needs review" />
                    )}
                    <Badge variant="outline" className="font-normal">
                      {hasPending ? "Awaiting Action" : "Up to date"}
                    </Badge>
                  </div>
                </div>
              );
            })}
            
            {team.length === 0 && !isLoading && (
              <p className="py-4 text-center text-sm text-muted-foreground">No reports assigned to your hierarchy.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
