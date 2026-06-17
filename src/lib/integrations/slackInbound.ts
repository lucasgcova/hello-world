import type { SupabaseClient } from "@supabase/supabase-js";

export interface SlackInstallation {
  workspace_id: string;
  slack_team_id: string;
  default_project_id: string | null;
  created_by: string | null;
}

// Look up the TeamSpace installation for a Slack team (service-role client).
export async function getInstallation(
  admin: SupabaseClient,
  slackTeamId: string,
): Promise<SlackInstallation | null> {
  const { data } = await admin
    .from("slack_installations")
    .select("*")
    .eq("slack_team_id", slackTeamId)
    .single();
  return (data as SlackInstallation) ?? null;
}

// Create a task in the installation's default project. Uses the service role,
// attributing the task to the admin who linked Slack.
export async function createTaskFromSlack(
  admin: SupabaseClient,
  install: SlackInstallation,
  title: string,
): Promise<{ ok: boolean; message: string }> {
  if (!install.default_project_id) {
    return { ok: false, message: "No default project is set for this Slack link." };
  }
  if (!install.created_by) {
    return { ok: false, message: "This Slack link has no owner to attribute tasks to." };
  }

  const { data: statuses } = await admin
    .from("project_statuses")
    .select("id")
    .eq("project_id", install.default_project_id)
    .order("position", { ascending: true })
    .limit(1);
  const statusId = (statuses?.[0] as { id?: string })?.id ?? null;

  const { data: maxRows } = await admin
    .from("tasks")
    .select("position")
    .eq("project_id", install.default_project_id)
    .order("position", { ascending: false })
    .limit(1);
  const position = ((maxRows?.[0] as { position?: number })?.position ?? 0) + 1000;

  const { error } = await admin.from("tasks").insert({
    project_id: install.default_project_id,
    status_id: statusId,
    title: title.trim().slice(0, 500),
    position,
    created_by: install.created_by,
  });
  if (error) return { ok: false, message: error.message };

  return { ok: true, message: `✅ Added task: ${title.trim()}` };
}

export async function listTasksFromSlack(
  admin: SupabaseClient,
  install: SlackInstallation,
): Promise<string> {
  if (!install.default_project_id) return "No default project is set.";
  const { data } = await admin
    .from("tasks")
    .select("title, completed_at")
    .eq("project_id", install.default_project_id)
    .is("completed_at", null)
    .order("position", { ascending: true })
    .limit(15);
  const tasks = (data ?? []) as { title: string }[];
  if (tasks.length === 0) return "No open tasks 🎉";
  return `*Open tasks:*\n${tasks.map((t) => `• ${t.title}`).join("\n")}`;
}
