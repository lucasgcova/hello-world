"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_WS_COOKIE } from "@/lib/workspace";
import type { MemberRole } from "@/lib/types";

const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
};

async function setActiveWorkspace(id: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WS_COOKIE, id, COOKIE_OPTS);
}

// First-run workspace creation (from onboarding form).
export async function createWorkspace(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("workspaces")
    .insert({ name, created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await setActiveWorkspace((data as { id: string }).id);
  revalidatePath("/", "layout");
  redirect("/");
}

// In-app workspace creation (from the switcher); returns the new id.
export async function createWorkspaceInApp(
  name: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("workspaces")
    .insert({ name: name.trim() || "Untitled workspace", created_by: user.id })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await setActiveWorkspace((data as { id: string }).id);
  revalidatePath("/", "layout");
  return { id: (data as { id: string }).id };
}

export async function switchWorkspace(id: string) {
  await setActiveWorkspace(id);
  revalidatePath("/", "layout");
}

export async function inviteMember(input: {
  workspaceId: string;
  email: string;
  role: MemberRole;
}): Promise<{ token?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const email = input.email.trim().toLowerCase();
  if (!email) return { error: "Email is required" };

  const { data, error } = await supabase
    .from("workspace_invitations")
    .upsert(
      {
        workspace_id: input.workspaceId,
        email,
        role: input.role,
        invited_by: user.id,
        accepted_at: null,
      },
      { onConflict: "workspace_id,email" },
    )
    .select("token")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/settings/members");
  return { token: (data as { token: string }).token };
}

export async function deleteInvitation(input: {
  id: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_invitations")
    .delete()
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/settings/members");
  return {};
}

export async function removeMember(input: {
  workspaceId: string;
  userId: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.userId);
  if (error) return { error: error.message };
  revalidatePath("/settings/members");
  return {};
}

export async function acceptInvitation(
  token: string,
): Promise<{ workspaceId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase.rpc("accept_invitation", {
    _token: token,
  });
  if (error) return { error: error.message };

  const workspaceId = data as unknown as string;
  await setActiveWorkspace(workspaceId);
  revalidatePath("/", "layout");
  return { workspaceId };
}
