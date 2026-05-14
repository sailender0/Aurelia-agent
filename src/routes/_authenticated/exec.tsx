import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/exec")({ component: ExecPage });

function ExecPage() {
  const [byClient, setByClient] = useState<{ name: string; hours: number }[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("timesheet_entries")
        .select("hours, projects(clients(name))");
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => {
        const name = r.projects?.clients?.name ?? "Unallocated";
        map.set(name, (map.get(name) ?? 0) + Number(r.hours || 0));
      });
      setByClient([...map.entries()].map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours));
    })();
  }, []);
  const total = byClient.reduce((s, x) => s + x.hours, 0);
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Executive overview</h1>
      <Card>
        <CardHeader><CardTitle>Hours by client · {total.toFixed(0)}h</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {byClient.length === 0 && <p className="text-sm text-muted-foreground">No allocations recorded yet.</p>}
          {byClient.map((c) => (
            <div key={c.name}>
              <div className="flex items-center justify-between text-sm">
                <span>{c.name}</span><span className="text-muted-foreground">{c.hours.toFixed(1)}h</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-[image:var(--gradient-hero)]" style={{ width: `${total ? (c.hours / total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
