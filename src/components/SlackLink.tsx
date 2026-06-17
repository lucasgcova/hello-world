"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { linkSlack, unlinkSlack } from "@/lib/actions/slack";

export function SlackLink({
  workspaceId,
  projects,
  installation,
}: {
  workspaceId: string;
  projects: { id: string; name: string }[];
  installation: { slack_team_id: string; default_project_id: string | null } | null;
}) {
  const router = useRouter();
  const [teamId, setTeamId] = useState(installation?.slack_team_id ?? "");
  const [projectId, setProjectId] = useState(
    installation?.default_project_id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await linkSlack({
      workspaceId,
      slackTeamId: teamId,
      defaultProjectId: projectId || null,
    });
    setBusy(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  async function unlink() {
    setBusy(true);
    await unlinkSlack({ workspaceId });
    setBusy(false);
    setTeamId("");
    setProjectId("");
    router.refresh();
  }

  return (
    <div className="rounded-xl border bg-sidebar p-4">
      <div className="mb-1 text-sm font-medium">Slack inbound (slash + mentions)</div>
      <p className="mb-3 text-sm opacity-60">
        Link your Slack workspace so <code>/teamspace add …</code> and mentioning
        the bot create tasks in a default project. Find your Slack{" "}
        <strong>Team ID</strong> via the Slack app config or{" "}
        <code>/api/...</code> request payloads. Point your app&apos;s slash
        command to <code>/api/slack/commands</code> and Event Subscriptions to{" "}
        <code>/api/slack/events</code>, and set <code>SLACK_SIGNING_SECRET</code>.
      </p>
      <form onSubmit={save} className="space-y-2">
        <input
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          placeholder="Slack Team ID (e.g. T0123ABCD)"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-lg border bg-background px-2 py-2 text-sm outline-none"
        >
          <option value="">Default project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {installation ? "Update link" : "Link Slack"}
          </button>
          {installation && (
            <button
              type="button"
              onClick={unlink}
              disabled={busy}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
            >
              Unlink
            </button>
          )}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
    </div>
  );
}
