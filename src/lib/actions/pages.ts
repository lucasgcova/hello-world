"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Block } from "@/lib/types";

export async function createPage(input: {
  workspaceId: string;
  parentId?: string | null;
  title?: string;
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("pages")
    .insert({
      workspace_id: input.workspaceId,
      parent_id: input.parentId ?? null,
      title: input.title?.trim() || "Untitled",
      content: [],
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { id: (data as { id: string }).id };
}

export async function updatePage(input: {
  id: string;
  title?: string;
  icon?: string;
  content?: Block[];
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.content !== undefined) patch.content = input.content;

  const { error } = await supabase.from("pages").update(patch).eq("id", input.id);
  if (error) return { error: error.message };

  // Refresh the sidebar (title/icon may have changed) without disrupting typing.
  if (input.title !== undefined || input.icon !== undefined) {
    revalidatePath("/", "layout");
  }
  return {};
}

export async function deletePage(input: { id: string }): Promise<void> {
  const supabase = await createClient();
  await supabase.from("pages").delete().eq("id", input.id);
  revalidatePath("/", "layout");
  redirect("/");
}
