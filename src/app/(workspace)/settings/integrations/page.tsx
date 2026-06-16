import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaces, resolveActiveWorkspace } from "@/lib/workspace";
import { adapters } from "@/lib/integrations/registry";
import { googleConfigured } from "@/lib/integrations/google";
import { aiConfigured, AI_MODEL } from "@/lib/ai/client";

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const workspaces = await getWorkspaces();
  const ws = await resolveActiveWorkspace(workspaces);
  if (!ws) redirect("/onboarding");

  const { data: gInfo } = await supabase.rpc("google_connection_info", {
    _workspace_id: ws.id,
  });
  const google = ((gInfo ?? []) as { connected: boolean; email: string | null }[])[0];
  const googleConnected = google?.connected ?? false;

  const slack = adapters.slack.status();

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6">
        <Link href="/" className="text-sm opacity-50 hover:opacity-100">
          ← Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Integrations</h1>
        <p className="mt-1 text-sm opacity-60">
          Connect <strong>{ws.name}</strong> to the tools your team already uses.
        </p>
      </div>

      <div className="space-y-3">
        {/* Claude */}
        <Row
          icon="✨"
          name="Claude (Anthropic)"
          connected={aiConfigured()}
          note={
            aiConfigured()
              ? `Connected. Model: ${AI_MODEL}.`
              : "Set ANTHROPIC_API_KEY to enable the AI assistant."
          }
        />

        {/* Slack */}
        <Row
          icon="💬"
          name="Slack"
          connected={slack.configured}
          note={slack.note}
        />

        {/* Google (Gmail + Drive) */}
        <Row
          icon="🔗"
          name="Google (Gmail + Drive)"
          connected={googleConnected}
          note={
            googleConnected
              ? `Connected${google?.email ? ` as ${google.email}` : ""}. The assistant can search Drive and Gmail.`
              : googleConfigured()
                ? "Connect a Google account to let the assistant search Drive and Gmail."
                : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then connect."
          }
          action={
            googleConnected ? (
              <form action="/api/integrations/google/disconnect" method="post">
                <button
                  type="submit"
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Disconnect
                </button>
              </form>
            ) : googleConfigured() ? (
              <a
                href="/api/integrations/google/connect"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Connect
              </a>
            ) : null
          }
        />
      </div>

      <p className="mt-6 text-xs opacity-50">
        Google Drive/Gmail search from the AI assistant also requires
        SUPABASE_SERVICE_ROLE_KEY to be set on the server.
      </p>
    </div>
  );
}

function Row({
  icon,
  name,
  connected,
  note,
  action,
}: {
  icon: string;
  name: string;
  connected: boolean;
  note: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-sidebar p-4">
      <div className="text-2xl">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{name}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              connected
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                : "bg-black/5 opacity-60 dark:bg-white/10"
            }`}
          >
            {connected ? "Connected" : "Not configured"}
          </span>
        </div>
        <p className="mt-1 text-sm opacity-60">{note}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
