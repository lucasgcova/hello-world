"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProjectView } from "@/lib/types";

export async function createView(input: {
  projectId: string;
  name: string;
  config: ProjectView["config"];
}): Promise<{ view?: ProjectView; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("project_views")
    .insert({
      project_id: input.projectId,
      name: input.name.trim() || "View",
      config: input.config,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/projects/${input.projectId}`);
  return { view: data as ProjectView };
}

export async function deleteView(input: {
  id: string;
  projectId: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_views")
    .delete()
    .eq("id", input.id);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${input.projectId}`);
  return {};
}
