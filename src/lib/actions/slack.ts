"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function linkSlack(input: {
  workspaceId: string;
  slackTeamId: string;
  defaultProjectId: string | null;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const teamId = input.slackTeamId.trim();
  if (!teamId) return { error: "Slack team ID is required" };

  const { error } = await supabase.from("slack_installations").upsert(
    {
      workspace_id: input.workspaceId,
      slack_team_id: teamId,
      default_project_id: input.defaultProjectId,
      created_by: user.id,
    },
    { onConflict: "workspace_id" },
  );
  if (error) return { error: error.message };

  revalidatePath("/settings/integrations");
  return {};
}

export async function unlinkSlack(input: {
  workspaceId: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("slack_installations")
    .delete()
    .eq("workspace_id", input.workspaceId);
  if (error) return { error: error.message };

  revalidatePath("/settings/integrations");
  return {};
}
