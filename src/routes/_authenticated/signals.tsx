import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listMySignals, listMyMappings, upsertIdentityMapping, seedDemoSignals } from "@/lib/signals.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, Webhook } from "lucide-react";

export const Route = createFileRoute("/_authenticated/signals")({ component: SignalsPage });

const SOURCES = ["jira", "github", "teams", "slack", "calendar", "manual"] as const;

function SignalsPage() {
  const fetchSignals = useServerFn(listMySignals);
  const fetchMappings = useServerFn(listMyMappings);
  const upsertMap = useServerFn(upsertIdentityMapping);
  const seed = useServerFn(seedDemoSignals);

  const [signals, setSignals] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [src, setSrc] = useState<typeof SOURCES[number]>("jira");
  const [extId, setExtId] = useState("");

  async function refresh() {
    try {
      const [s, m] = await Promise.all([fetchSignals(), fetchMappings()]);
      setSignals(s.signals); setMappings(m.mappings);
    } catch (e: any) { toast.error(e.message); }
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, []);

  async function addMapping() {
    if (!extId.trim()) return;
    try { await upsertMap({ data: { source: src, external_id: extId.trim() } }); setExtId(""); toast.success("Linked"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function seedDemo() {
    try { const r = await seed(); toast.success(`Seeded ${r.count} demo signals`); refresh(); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity Signals</h1>
          <p className="text-sm text-muted-foreground">Connector identities + recent activity feed used by the AI attribution engine.</p>
        </div>
        <Button onClick={seedDemo}><Sparkles className="mr-2 h-4 w-4" />Seed demo signals</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Webhook className="h-4 w-4" />Identity links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Select value={src} onValueChange={(v) => setSrc(v as any)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="External user id (e.g. github login)" value={extId} onChange={(e) => setExtId(e.target.value)} />
            <Button onClick={addMapping}>Link</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {mappings.map((m) => (
              <Badge key={m.id} variant="secondary">{m.source}: {m.external_id}</Badge>
            ))}
            {mappings.length === 0 && <p className="text-sm text-muted-foreground">No identity links yet. Add at least one per connector to receive ingested signals.</p>}
          </div>
          <div className="rounded-md bg-muted/40 p-3 text-xs">
            <div className="mb-1 font-medium">Webhook endpoint</div>
            <code className="block break-all">POST /api/public/hooks/activity-signal · header <strong>x-ingest-secret</strong></code>
            <div className="mt-1 text-muted-foreground">Body: <code>{`{ source, signal_type, external_user_id|user_email, occurred_at?, duration_minutes?, project_hint?, metadata? }`}</code> (or <code>{`{ signals: [...] }`}</code>)</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent signals (14 days)</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y divide-border text-sm">
            {signals.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{s.source}</Badge>
                  <span>{s.signal_type}</span>
                  {s.project_hint && <span className="font-mono text-xs text-muted-foreground">{s.project_hint}</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.duration_minutes ? `${s.duration_minutes}m · ` : ""}{new Date(s.occurred_at).toLocaleString()}
                </div>
              </div>
            ))}
            {signals.length === 0 && <p className="py-6 text-center text-muted-foreground">No signals yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
