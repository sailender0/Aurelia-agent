/**
 * modules/audit — write-only audit trail.
 * Server-only. Never imported from browser code.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuditEntry = {
  actorId?: string | null;
  actorKind?: "user" | "system" | "webhook";
  action: string;
  targetTable?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  context?: Record<string, unknown>;
};

export async function writeAudit(e: AuditEntry): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_id: e.actorId ?? null,
    actor_kind: e.actorKind ?? "user",
    action: e.action,
    target_table: e.targetTable ?? null,
    target_id: e.targetId ?? null,
    before: (e.before ?? null) as never,
    after: (e.after ?? null) as never,
    context: (e.context ?? {}) as never,
  });
  if (error) console.error("[audit] write failed", error.message, e.action);
}
