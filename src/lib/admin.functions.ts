import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw error;
  if (!data?.some((r) => r.role === "admin")) throw new Error("Forbidden: admin only");
}

export const adminListPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").order("created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role as string);
      rolesByUser.set(r.user_id, arr);
    }
    return {
      people: (profiles ?? []).map((p) => ({ ...p, roles: rolesByUser.get(p.id) ?? [] })),
    };
  });

export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    userId: z.string().uuid(),
    role: z.enum(["admin", "hr", "executive", "manager", "employee"]),
    grant: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.grant) {
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: data.userId, role: data.role },
        { onConflict: "user_id,role" }
      );
    } else {
      await supabaseAdmin.from("user_roles").delete()
        .eq("user_id", data.userId).eq("role", data.role);
    }
    return { ok: true };
  });

export const adminSetManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    userId: z.string().uuid(),
    managerId: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await supabaseAdmin.from("profiles").update({ manager_id: data.managerId }).eq("id", data.userId);
    return { ok: true };
  });

export const adminCreateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin.from("clients").insert({ name: data.name }).select().single();
    if (error) throw error;
    return row;
  });

export const adminCreateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().min(1).max(120),
    code: z.string().min(1).max(40).regex(/^[A-Z0-9_-]+$/),
    clientId: z.string().uuid(),
    billable: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin.from("projects").insert({
      name: data.name, code: data.code, client_id: data.clientId, billable: data.billable,
    }).select().single();
    if (error) throw error;
    return row;
  });

export const adminListClientsAndProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [{ data: clients }, { data: projects }] = await Promise.all([
      supabaseAdmin.from("clients").select("*").order("name"),
      supabaseAdmin.from("projects").select("*, clients(name)").order("code"),
    ]);
    return { clients: clients ?? [], projects: projects ?? [] };
  });
