import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/hr")({ component: HRPage });

function HRPage() {
  const [counts, setCounts] = useState({ employees: 0, submitted: 0, approved: 0 });
  useEffect(() => {
    (async () => {
      const [{ count: emp }, { count: sub }, { count: app }] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("draft_timesheets").select("*", { count: "exact", head: true }).eq("status", "submitted"),
        supabase.from("draft_timesheets").select("*", { count: "exact", head: true }).eq("status", "approved"),
      ]);
      setCounts({ employees: emp ?? 0, submitted: sub ?? 0, approved: app ?? 0 });
    })();
  }, []);
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">HR console</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Employees" value={counts.employees} />
        <Stat label="Pending submissions" value={counts.submitted} />
        <Stat label="Approved this cycle" value={counts.approved} />
      </div>
      <Card>
        <CardHeader><CardTitle>Payroll exports</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">CSV export of approved timesheets coming next iteration.</CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent><div className="text-3xl font-semibold">{value}</div></CardContent>
    </Card>
  );
}
