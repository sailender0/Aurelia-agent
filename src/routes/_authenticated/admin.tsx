import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListPeople, adminSetRole, adminSetManager,
  adminCreateClient, adminCreateProject, adminListClientsAndProjects,
} from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({ component: AdminPage });

const ROLES = ["admin", "hr", "executive", "manager", "employee"] as const;

function AdminPage() {
  const { roles } = useAuth();
  const listPeople = useServerFn(adminListPeople);
  const setRole = useServerFn(adminSetRole);
  const setManager = useServerFn(adminSetManager);
  const listCp = useServerFn(adminListClientsAndProjects);
  const createClient = useServerFn(adminCreateClient);
  const createProject = useServerFn(adminCreateProject);

  const [people, setPeople] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [newClient, setNewClient] = useState("");
  const [newProj, setNewProj] = useState({ name: "", code: "", clientId: "", billable: true });

  async function refresh() {
    setLoading(true);
    try {
      const [p, cp] = await Promise.all([listPeople(), listCp()]);
      setPeople(p.people);
      setClients(cp.clients);
      setProjects(cp.projects);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, []);

  if (!roles.includes("admin")) {
    return (
      <div className="p-8">
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Shield className="mx-auto mb-2 h-8 w-8" />Admin access required.
        </CardContent></Card>
      </div>
    );
  }

  async function toggleRole(userId: string, role: any, grant: boolean) {
    try { await setRole({ data: { userId, role, grant } }); toast.success("Updated"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function changeManager(userId: string, managerId: string) {
    try {
      await setManager({ data: { userId, managerId: managerId === "_none" ? null : managerId } });
      toast.success("Manager updated"); refresh();
    } catch (e: any) { toast.error(e.message); }
  }
  async function addClient() {
    if (!newClient.trim()) return;
    try { await createClient({ data: { name: newClient.trim() } }); setNewClient(""); toast.success("Client added"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function addProject() {
    if (!newProj.name || !newProj.code || !newProj.clientId) return toast.error("Fill all fields");
    try {
      await createProject({ data: newProj });
      setNewProj({ name: "", code: "", clientId: "", billable: true });
      toast.success("Project added"); refresh();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Console</h1>
        <p className="text-sm text-muted-foreground">Seed clients, projects, and assign roles & managers.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Clients</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Acme Corp" value={newClient} onChange={(e) => setNewClient(e.target.value)} />
              <Button onClick={addClient}><Plus className="mr-1 h-4 w-4" />Add</Button>
            </div>
            <div className="divide-y divide-border text-sm">
              {clients.map((c) => <div key={c.id} className="py-2">{c.name}</div>)}
              {clients.length === 0 && <p className="py-3 text-muted-foreground">No clients yet.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Projects</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Project name" value={newProj.name} onChange={(e) => setNewProj({ ...newProj, name: e.target.value })} />
              <Input placeholder="CODE (PHX)" value={newProj.code} onChange={(e) => setNewProj({ ...newProj, code: e.target.value.toUpperCase() })} />
              <Select value={newProj.clientId} onValueChange={(v) => setNewProj({ ...newProj, clientId: v })}>
                <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={addProject}><Plus className="mr-1 h-4 w-4" />Add project</Button>
            </div>
            <div className="divide-y divide-border text-sm">
              {projects.map((p) => (
                <div key={p.id} className="flex justify-between py-2">
                  <span><span className="font-mono text-xs text-muted-foreground">{p.code}</span> {p.name}</span>
                  <span className="text-muted-foreground">{p.clients?.name}</span>
                </div>
              ))}
              {projects.length === 0 && <p className="py-3 text-muted-foreground">No projects yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>People · roles & manager</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-muted-foreground">Loading…</p> : (
            <div className="space-y-3">
              {people.map((p) => (
                <div key={p.id} className="rounded-lg border border-border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{p.display_name}</div>
                      <div className="text-xs text-muted-foreground">{p.email}</div>
                    </div>
                    <Select value={p.manager_id ?? "_none"} onValueChange={(v) => changeManager(p.id, v)}>
                      <SelectTrigger className="w-[220px]"><SelectValue placeholder="Manager" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— No manager —</SelectItem>
                        {people.filter((m) => m.id !== p.id).map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ROLES.map((r) => {
                      const has = p.roles.includes(r);
                      return (
                        <Badge
                          key={r}
                          variant={has ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleRole(p.id, r, !has)}
                        >{r}</Badge>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
