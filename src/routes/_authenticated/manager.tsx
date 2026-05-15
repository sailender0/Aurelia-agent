import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manager")({ component: ManagerPage });

function ManagerPage() {
  const { user } = useAuth();
  const [pending, setPending] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      // 1. Fetch direct reports based on the manager_id link
      const { data: teamData, error: teamError } = await supabase
        .from("profiles")
        .select("*")
        .eq("manager_id", user.id);
      
      if (teamError) throw teamError;
      setTeam(teamData ?? []);
      
      const teamIds = (teamData ?? []).map((member) => member.id);
      
      if (teamIds.length === 0) {
        setPending([]);
        return;
      }

      // 2. Fetch submitted timesheets (Standard join to prevent RLS-inner-join drops)
      const { data: timesheetData, error: tsError } = await supabase
        .from("draft_timesheets")
        .select("*, profiles(display_name)")
        .in("user_id", teamIds)
        .eq("status", "submitted");
      
      if (tsError) throw tsError;
      
      console.log("Manager Data Loaded:", { teamCount: teamData.length, pendingCount: timesheetData.length });
      setPending(timesheetData ?? []);
    } catch (error: any) {
      console.error("Manager Load Error:", error);
      toast.error(error.message || "Failed to load team data");
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: "approved" | "rejected") {
    try {
      const { error: updateError } = await supabase
        .from("draft_timesheets")
        .update({ status: decision })
        .eq("id", id);

      if (updateError) throw updateError;

      await supabase.from("timesheet_approvals").insert({
        timesheet_id: id,
        manager_id: user!.id,
        decision
      });

      toast.success(`Timesheet ${decision} successfully`);
      await load(); // Refresh the list
    } catch (error: any) {
      toast.error(error.message || "Failed to process decision");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Team console</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* SECTION 1: PENDING APPROVALS */}
      <Card className="border-primary/20 shadow-md">
        <CardHeader className="bg-primary/5">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-primary">
            Pending approvals · {pending.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {pending.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="mb-3 h-10 w-10 text-green-500/40" />
              <p className="text-sm font-medium text-muted-foreground">All caught up!</p>
              <p className="text-xs text-muted-foreground">No pending submissions from your team.</p>
            </div>
          )}
          
          {pending.map((t) => (
            <div key={t.id} className="flex flex-col gap-4 rounded-xl border border-border p-5 transition-colors hover:bg-muted/30 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  {t.profiles?.display_name || "Team Member"}
                  <Badge variant="secondary" className="text-[10px]">
                    {Math.round((t.ai_confidence ?? 0) * 100)}% AI Score
                  </Badge>
                </div>
                <div className="text-xs font-medium text-muted-foreground">
                  Week starting: {new Date(t.week_start).toLocaleDateString(undefined, { dateStyle: 'long' })}
                </div>
                {t.ai_summary && (
                  <p className="max-w-md text-sm text-muted-foreground border-l-2 border-primary/20 pl-3 mt-2 py-1">
                    {t.ai_summary}
                  </p>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => decide(t.id, "rejected")}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
                <Button 
                  size="sm" 
                  className="bg-green-600 hover:bg-green-700 shadow-sm"
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

      {/* SECTION 2: DIRECT REPORTS ROSTER */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Direct reports · {team.length}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {team.map((p) => {
              const hasPending = pending.some(item => item.user_id === p.id);
              
              return (
                <div key={p.id} className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                      {p.display_name?.charAt(0).toUpperCase() || "E"}
                    </div>
                    <div>
                      <div className="font-semibold">{p.display_name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{p.employment_type?.replace('_', ' ') || 'Employee'}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {hasPending && (
                      <Badge className="bg-amber-500 hover:bg-amber-600 border-none animate-pulse">
                        Action Required
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-muted-foreground font-normal">
                      ID: {p.id.split('-')[0]}...
                    </Badge>
                  </div>
                </div>
              );
            })}
            
            {team.length === 0 && !isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground italic">
                No direct reports found under your management.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
