import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: "/dashboard" });
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (r.error) toast.error("Google sign-in failed");
  }

  async function microsoft() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email openid profile offline_access User.Read",
        redirectTo: window.location.origin + "/dashboard",
      },
    });
    if (error) {
      toast.error(
        "Microsoft sign-in failed. Confirm the Azure provider is enabled in the backend with AZURE_CLIENT_ID / AZURE_CLIENT_SECRET and that the redirect URI " +
          window.location.origin +
          "/dashboard is registered in Entra ID.",
      );
    }
  }

  async function github() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        scopes: "read:user user:email repo",
        redirectTo: window.location.origin + "/dashboard",
      },
    });
    if (error) {
      toast.error(
        "GitHub sign-in failed. Enable the GitHub provider in the backend (Authentication → Providers) and add the redirect URI " +
          window.location.origin +
          "/dashboard to your GitHub OAuth app.",
      );
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elegant)]">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in to Aurelia</h1>
        <p className="mt-1 text-sm text-muted-foreground">Welcome back. Pick up where you left off.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading} className="w-full">{loading ? "Signing in…" : "Sign in"}</Button>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
        </div>
        <div className="space-y-2">
          <Button variant="outline" className="w-full" onClick={microsoft}>Continue with Microsoft (Entra ID)</Button>
          <Button variant="outline" className="w-full" onClick={github}>Continue with GitHub</Button>
          <Button variant="outline" className="w-full" onClick={google}>Continue with Google</Button>

        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here? <Link to="/signup" className="text-primary underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
