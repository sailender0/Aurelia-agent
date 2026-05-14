import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Brain, Clock, Users, BarChart3, MessageSquare, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[image:var(--gradient-hero)] text-primary-foreground font-bold">A</div>
            <span className="font-semibold tracking-tight">Aurelia</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link to="/login"><Button variant="ghost">Sign in</Button></Link>
            <Link to="/signup"><Button>Get started</Button></Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 py-24 lg:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-success" /> Teams-native · AI-assisted · Enterprise-grade
            </div>
            <h1 className="mt-6 text-5xl font-bold tracking-tight text-foreground lg:text-6xl">
              AI Workforce Attribution &<br />
              <span className="bg-[image:var(--gradient-hero)] bg-clip-text text-transparent">Timesheet Intelligence</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Stop losing hours to manual timesheets. Aurelia reconstructs work from operational signals across Teams, Jira, GitHub and Calendar — then asks employees to confirm. Multi-client, multi-project, manager-approved.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signup"><Button size="lg" className="shadow-[var(--shadow-elegant)]">Start free trial</Button></Link>
              <Link to="/login"><Button size="lg" variant="outline">View dashboard demo</Button></Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-secondary/30">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-20 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-[image:var(--gradient-card)] p-6">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-8 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Aurelia · AI Workforce Intelligence Platform
        </div>
      </footer>
    </div>
  );
}

const features = [
  { icon: Clock, title: "Teams-native attendance", desc: "Check-in / check-out from inside Microsoft Teams. Daily and weekly nudges via the bot." },
  { icon: Brain, title: "AI timesheet reconstruction", desc: "Drafts your weekly hours from meetings, commits, tickets. You review — never auto-submitted." },
  { icon: Users, title: "Multi-client attribution", desc: "Split allocations across clients and projects with confidence-scored AI inference." },
  { icon: BarChart3, title: "Operational analytics", desc: "Utilization, billable mix, delivery KPIs for managers, HR and executives." },
  { icon: MessageSquare, title: "Friday confirmation flow", desc: "AI summary + adaptive cards. Employee approves, manager signs off, HR exports." },
  { icon: ShieldCheck, title: "Metadata-only, never spyware", desc: "We use signals — not keystrokes. Confidence scoring with explainable rationales." },
];
