"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createLabel(input: {
  workspaceId: string;
  name: string;
  color?: string;
  projectId?: string;
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("labels")
    .insert({
      workspace_id: input.workspaceId,
      name: input.name.trim() || "Label",
      color: input.color || "#64748b",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  if (input.projectId) revalidatePath(`/projects/${input.projectId}`);
  return { id: (data as { id: string }).id };
}

export async function deleteLabel(input: {
  id: string;
  projectId?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("labels").delete().eq("id", input.id);
  if (error) return { error: error.message };
  if (input.projectId) revalidatePath(`/projects/${input.projectId}`);
  return {};
}

// Replace the full set of labels on a task.
export async function setTaskLabels(input: {
  taskId: string;
  projectId: string;
  labelIds: string[];
}): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { error: delErr } = await supabase
    .from("task_labels")
    .delete()
    .eq("task_id", input.taskId);
  if (delErr) return { error: delErr.message };

  if (input.labelIds.length > 0) {
    const { error: insErr } = await supabase.from("task_labels").insert(
      input.labelIds.map((label_id) => ({
        task_id: input.taskId,
        label_id,
      })),
    );
    if (insErr) return { error: insErr.message };
  }

  revalidatePath(`/projects/${input.projectId}`);
  return {};
}
