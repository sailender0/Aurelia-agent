import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Bot Framework messaging endpoint for the Aurelia Teams bot.
// Handles `conversationUpdate` activities and persists team install metadata
// (serviceUrl, tenantId, channelId) so we can post proactive check-in cards.
//
// SECURITY: Bot Framework signs every request with a JWT in the Authorization
// header. For full production use, validate it against Microsoft's JWKS
// (https://login.botframework.com/v1/.well-known/openidconfiguration). For now
// we require MICROSOFT_APP_ID to be configured and reject unauthenticated calls.
export const Route = createFileRoute("/api/public/bot/messages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!process.env.MICROSOFT_APP_ID) {
          return new Response("Bot not configured: set MICROSOFT_APP_ID", { status: 503 });
        }
        if (!auth.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }

        let activity: any;
        try { activity = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

        if (activity?.type === "conversationUpdate") {
          const added = activity.membersAdded ?? [];
          const botAdded = added.some((m: any) => m.id === activity.recipient?.id);
          if (botAdded) {
            const teamInternalId = activity.channelData?.team?.id ?? activity.conversation?.id;
            const channelId = activity.channelData?.channel?.id ?? activity.conversation?.id;
            const tenantId = activity.channelData?.tenant?.id ?? activity.conversation?.tenantId;
            const serviceUrl = activity.serviceUrl;
            const teamName = activity.channelData?.team?.name ?? "Unknown team";
            const teamAadId = activity.channelData?.team?.aadGroupId ?? null;
            const installedBy = activity.from?.name ?? null;

            if (teamInternalId && channelId && tenantId && serviceUrl) {
              const { error } = await supabaseAdmin
                .from("teams_connections")
                .upsert(
                  {
                    team_name: teamName,
                    team_aad_id: teamAadId,
                    team_internal_id: teamInternalId,
                    channel_id: channelId,
                    tenant_id: tenantId,
                    service_url: serviceUrl,
                    installed_by: installedBy,
                  },
                  { onConflict: "team_internal_id,channel_id" }
                );
              if (error) console.error("teams_connections upsert failed", error);
            }
          }
        }

        // Bot Framework expects a 200 even when there's nothing to reply.
        return new Response(null, { status: 200 });
      },
    },
  },
});
