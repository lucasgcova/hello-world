"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createProject(input: {
  workspaceId: string;
  name: string;
  icon?: string;
  color?: string;
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("projects")
    .insert({
      workspace_id: input.workspaceId,
      name: input.name.trim() || "Untitled project",
      icon: input.icon || "📋",
      color: input.color || "#6366f1",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { id: (data as { id: string }).id };
}

export async function deleteProject(projectId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}
