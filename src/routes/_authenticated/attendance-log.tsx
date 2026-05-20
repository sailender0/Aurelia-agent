import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Mail, LogIn, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/attendance-log")({
  component: AttendanceLogPage,
});

type Row = {
  id: string;
  email: string;
  type: "check_in" | "check_out";
  timestamp: string;
  source: string | null;
  raw_subject: string | null;
};

function AttendanceLogPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("attendance")
      .select("id,email,type,timestamp,source,raw_subject")
      .order("timestamp", { ascending: false })
      .limit(200);
    if (!error && data) setRows(data as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) =>
    filter ? r.email.toLowerCase().includes(filter.toLowerCase()) : true,
  );

  const todayCount = rows.filter(
    (r) => new Date(r.timestamp).toDateString() === new Date().toDateString(),
  ).length;
  const checkIns = rows.filter((r) => r.type === "check_in").length;
  const checkOuts = rows.filter((r) => r.type === "check_out").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance Email Log</h1>
          <p className="text-sm text-muted-foreground">
            Live feed from the Power Automate <code>ATTENDANCE_WEBHOOK_SUBMIT</code> pipeline.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Today</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{todayCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Check-ins</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold text-emerald-500">{checkIns}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Check-outs</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold text-amber-500">{checkOuts}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" /> Recent events
          </CardTitle>
          <Input
            placeholder="Filter by email…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="grid place-items-center py-12 text-center text-sm text-muted-foreground">
              No attendance events yet. Trigger your Power Automate flow to see entries appear here.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`grid h-9 w-9 place-items-center rounded-full ${
                      r.type === "check_in"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-amber-500/10 text-amber-500"
                    }`}>
                      {r.type === "check_in" ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.timestamp).toLocaleString()} · {r.source ?? "—"}
                      </div>
                    </div>
                  </div>
                  <Badge variant={r.type === "check_in" ? "default" : "secondary"}>
                    {r.type.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Power Automate configuration</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div><strong className="text-foreground">Endpoint:</strong> <code>POST /api/public/attendance/email-webhook</code></div>
          <div><strong className="text-foreground">Header:</strong> <code>x-webhook-secret: &lt;ATTENDANCE_INGEST_SECRET&gt;</code></div>
          <div><strong className="text-foreground">Subject filter:</strong> <code>ATTENDANCE_WEBHOOK_SUBMIT</code></div>
          <div><strong className="text-foreground">Body template:</strong></div>
          <pre className="rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground">{`email: user@example.com
type: check_in`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
