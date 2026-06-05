import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Github, GitCommit, BookMarked } from "lucide-react";

type Stats = {
  login: string;
  avatar_url: string;
  publicRepos: number;
  totalRepos: number;
  totalCommits: number;
};

export function GithubStatsCard() {
  const [token, setToken] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try { setToken(localStorage.getItem("github_provider_token")); } catch {}
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
        const meRes = await fetch("https://api.github.com/user", { headers });
        if (!meRes.ok) throw new Error(`GitHub ${meRes.status}`);
        const me = await meRes.json();

        const reposRes = await fetch("https://api.github.com/user/repos?per_page=1&affiliation=owner,collaborator,organization_member", { headers });
        const link = reposRes.headers.get("Link") ?? "";
        const lastMatch = link.match(/page=(\d+)>;\s*rel="last"/);
        const totalRepos = lastMatch ? parseInt(lastMatch[1], 10) : (await reposRes.json()).length ?? 0;

        const commitsRes = await fetch(
          `https://api.github.com/search/commits?q=author:${encodeURIComponent(me.login)}&per_page=1`,
          { headers: { ...headers, Accept: "application/vnd.github.cloak-preview+json" } },
        );
        const commitsJson = commitsRes.ok ? await commitsRes.json() : { total_count: 0 };

        if (cancelled) return;
        setStats({
          login: me.login,
          avatar_url: me.avatar_url,
          publicRepos: me.public_repos ?? 0,
          totalRepos,
          totalCommits: commitsJson.total_count ?? 0,
        });
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? "Failed to load GitHub stats");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            <Github className="h-4 w-4" /> GitHub
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">Sign in with GitHub to see your commit and repo counts.</p>
          <Button size="sm" variant="outline" asChild><a href="/login">Connect GitHub</a></Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <Github className="h-4 w-4" /> GitHub {stats?.login && <span className="font-mono">@{stats.login}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {stats && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><GitCommit className="h-3 w-3" /> Commits</div>
              <div className="text-2xl font-semibold">{stats.totalCommits.toLocaleString()}</div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><BookMarked className="h-3 w-3" /> Repos</div>
              <div className="text-2xl font-semibold">{stats.totalRepos.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{stats.publicRepos} public</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
