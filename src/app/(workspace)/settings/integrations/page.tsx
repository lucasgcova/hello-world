import Link from "next/link";
import { integrationStatuses } from "@/lib/integrations/registry";
import { aiConfigured, AI_MODEL } from "@/lib/ai/client";

export default function IntegrationsPage() {
  const statuses = integrationStatuses();
  const ai = aiConfigured();

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6">
        <Link href="/" className="text-sm opacity-50 hover:opacity-100">
          ← Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Integrations</h1>
        <p className="mt-1 text-sm opacity-60">
          Connect TeamSpace to the tools your team already uses. Configure these
          via environment variables (see <code>.env.example</code>).
        </p>
      </div>

      <div className="space-y-3">
        <Row
          icon="✨"
          name="Claude (Anthropic)"
          configured={ai}
          note={
            ai
              ? `Connected. Model: ${AI_MODEL}.`
              : "Set ANTHROPIC_API_KEY to enable the AI assistant."
          }
        />
        {statuses.map((s) => (
          <Row
            key={s.id}
            icon={ICONS[s.id]}
            name={s.name}
            configured={s.configured}
            note={s.note}
          />
        ))}
      </div>
    </div>
  );
}

const ICONS: Record<string, string> = {
  slack: "💬",
  gmail: "📧",
  gdrive: "📁",
};

function Row({
  icon,
  name,
  configured,
  note,
}: {
  icon: string;
  name: string;
  configured: boolean;
  note: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-sidebar p-4">
      <div className="text-2xl">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{name}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              configured
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                : "bg-black/5 opacity-60 dark:bg-white/10"
            }`}
          >
            {configured ? "Connected" : "Not configured"}
          </span>
        </div>
        <p className="mt-1 text-sm opacity-60">{note}</p>
      </div>
    </div>
  );
}
