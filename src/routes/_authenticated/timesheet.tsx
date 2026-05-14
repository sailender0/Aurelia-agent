import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { generateAITimesheet } from "@/lib/timesheet.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send } from "lucide-react";
import { toast } from "sonner";
import { mondayOf, fmtHours } from "@/lib/week";

export const Route = createFileRoute("/_authenticated/timesheet")({
  validateSearch: z.object({ week: z.string().optional() }),
  component: TimesheetPage,
});

function TimesheetPage() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const [week, setWeek] = useState(search.week ?? mondayOf());
  const [draft, setDraft] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const generate = useServerFn(generateAITimesheet);

  async function load() {
    const { data: d } = await supabase.from("draft_timesheets").select("*").eq("user_id", user!.id).eq("week_start", week).maybeSingle();
    setDraft(d);
    if (d) {
      const { data: e } = await supabase.from("timesheet_entries").select("*, projects(name, code)").eq("timesheet_id", d.id);
      setEntries(e ?? []);
    } else { setEntries([]); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [week, user?.id]);

  async function runAI() {
    setLoading(true);
    try {
      await generate({ data: { weekStart: week } });
      toast.success("AI draft generated");
      await load();
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }

  async function submit() {
    if (!draft) return;
    const { error } = await supabase.from("draft_timesheets").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", draft.id);
    if (error) return toast.error(error.message);
    toast.success("Submitted to manager");
    void load();
  }

  const total = entries.reduce((s, e) => s + Number(e.hours || 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly timesheet</h1>
          <p className="text-sm text-muted-foreground">Friday confirmation flow — AI drafts, you approve.</p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Week starting (Mon)</label>
            <Input type="date" value={week} onChange={(e) => setWeek(e.target.value)} />
          </div>
          <Button onClick={runAI} disabled={loading}><Sparkles className="mr-2 h-4 w-4" />{loading ? "Thinking…" : "AI draft"}</Button>
        </div>
      </div>

      {draft ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>AI summary</CardTitle>
              <Badge variant={draft.status === "approved" ? "default" : draft.status === "submitted" ? "secondary" : "outline"}>{draft.status}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{draft.ai_summary || "No summary yet."}</p>
            <div className="mt-2 text-xs text-muted-foreground">Confidence: {((draft.ai_confidence ?? 0) * 100).toFixed(0)}%</div>
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No draft for this week. Click "AI draft" to generate one from your activity signals.</CardContent></Card>
      )}

      {entries.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Allocations · {fmtHours(total)}</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {entries.map((e) => (
                <div key={e.id} className="flex items-start justify-between py-3 text-sm">
                  <div>
                    <div className="font-medium">{e.projects?.name ?? e.category}</div>
                    <div className="text-xs text-muted-foreground">{e.ai_rationale}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{fmtHours(Number(e.hours))}</div>
                    <div className="text-xs text-muted-foreground">{e.ai_confidence ? `${(e.ai_confidence * 100).toFixed(0)}% conf.` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
            {draft?.status === "draft" && (
              <Button className="mt-6" onClick={submit}><Send className="mr-2 h-4 w-4" />Submit to manager</Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
