"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notifyAll } from "@/lib/integrations/registry";
import type { TaskPriority } from "@/lib/types";

export async function createTask(input: {
  projectId: string;
  statusId: string | null;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Append to the end of the project's ordering.
  const { data: maxRows } = await supabase
    .from("tasks")
    .select("position")
    .eq("project_id", input.projectId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPos = ((maxRows?.[0] as { position?: number })?.position ?? 0) + 1000;

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: input.projectId,
      status_id: input.statusId,
      title: input.title.trim() || "Untitled task",
      description: input.description ?? null,
      priority: input.priority ?? "none",
      assignee_id: input.assigneeId ?? null,
      due_date: input.dueDate ?? null,
      position: nextPos,
      created_by: user.id,
    })
    .select("id, title")
    .single();

  if (error) return { error: error.message };

  void notifyAll({
    title: "New task",
    text: `“${(data as { title: string }).title}” was added.`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/projects/${input.projectId}`,
  });

  revalidatePath(`/projects/${input.projectId}`);
  return { id: (data as { id: string }).id };
}

export async function updateTask(input: {
  id: string;
  projectId: string;
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  statusId?: string | null;
}): Promise<{ error?: string }> {
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.assigneeId !== undefined) patch.assignee_id = input.assigneeId;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate;
  if (input.statusId !== undefined) patch.status_id = input.statusId;

  const { error } = await supabase.from("tasks").update(patch).eq("id", input.id);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${input.projectId}`);
  return {};
}

export async function moveTask(input: {
  id: string;
  projectId: string;
  statusId: string | null;
  position: number;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status_id: input.statusId, position: input.position })
    .eq("id", input.id);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${input.projectId}`);
  return {};
}

export async function deleteTask(input: {
  id: string;
  projectId: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${input.projectId}`);
  return {};
}

export async function addComment(input: {
  taskId: string;
  projectId: string;
  body: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("comments").insert({
    task_id: input.taskId,
    author_id: user.id,
    body: input.body.trim(),
  });
  if (error) return { error: error.message };

  revalidatePath(`/projects/${input.projectId}`);
  return {};
}
