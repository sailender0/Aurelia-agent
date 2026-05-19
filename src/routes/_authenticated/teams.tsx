import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { teamsListChannels, teamsSaveChannel, teamsGetChannel, teamsTestPost } from "@/lib/teams.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/teams")({ component: TeamsPage });

type TeamRow = { id: string; displayName: string; channels: { id: string; displayName: string }[] };

function TeamsPage() {
  const { roles } = useAuth();
  const list = useServerFn(teamsListChannels);
  const save = useServerFn(teamsSaveChannel);
  const get = useServerFn(teamsGetChannel);
  const test = useServerFn(teamsTestPost);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamId, setTeamId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [msg, setMsg] = useState("Hello from the Aurelia bot 👋");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [{ teams: t }, { config }] = await Promise.all([list(), get()]);
      setTeams(t as TeamRow[]);
      if (config?.teamId) setTeamId(config.teamId);
      if (config?.channelId) setChannelId(config.channelId);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }

  async function onSync() {
    setSyncing(true);
    try {
      const { teams: t } = await list();
      setTeams(t as TeamRow[]);
      toast.success(`Synced ${t.length} team(s) from Microsoft Graph`);
    } catch (e: any) { toast.error(e.message); }
    setSyncing(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (!roles.includes("admin")) {
    return <div className="p-8"><Card><CardContent className="p-8 text-center text-muted-foreground">Admin only.</CardContent></Card></div>;
  }

  const channels = teams.find((t) => t.id === teamId)?.channels ?? [];

  async function onSave() {
    if (!teamId || !channelId) return toast.error("Pick team & channel");
    try { await save({ data: { teamId, channelId } }); toast.success("Saved"); }
    catch (e: any) { toast.error(e.message); }
  }
  async function onTest() {
    try { await test({ data: { message: msg } }); toast.success("Posted to Teams"); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><MessageSquare className="h-6 w-6" />Microsoft Teams</h1>
        <p className="text-sm text-muted-foreground">
          Pick the channel where Aurelia posts attendance & timesheet updates.
          Channel list is fetched live via the delegated Microsoft Graph token.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Notification channel</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p className="text-muted-foreground">Loading teams…</p> : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={teamId} onValueChange={(v) => { setTeamId(v); setChannelId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.displayName}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={channelId} onValueChange={setChannelId} disabled={!teamId}>
                <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.displayName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={onSave}>Save</Button>
            <Button variant="outline" onClick={onSync} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync Teams channels"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Send a test message</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input value={msg} onChange={(e) => setMsg(e.target.value)} />
          <Button variant="secondary" onClick={onTest}>Post test message</Button>
        </CardContent>
      </Card>
    </div>
  );
}
