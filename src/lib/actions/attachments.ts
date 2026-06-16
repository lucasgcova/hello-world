"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TaskAttachment } from "@/lib/types";

export async function addTaskAttachment(input: {
  taskId: string;
  projectId: string;
  title: string;
  url: string;
  source?: "link" | "drive";
  mimeType?: string | null;
}): Promise<{ attachment?: TaskAttachment; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("task_attachments")
    .insert({
      task_id: input.taskId,
      title: input.title.trim() || input.url,
      url: input.url,
      source: input.source ?? "link",
      mime_type: input.mimeType ?? null,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/projects/${input.projectId}`);
  return { attachment: data as TaskAttachment };
}

export async function removeTaskAttachment(input: {
  id: string;
  projectId: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_attachments")
    .delete()
    .eq("id", input.id);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${input.projectId}`);
  return {};
}
