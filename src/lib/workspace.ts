import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/types";

export const ACTIVE_WS_COOKIE = "ts_active_workspace";

// Workspaces the current user belongs to (RLS-scoped), oldest first.
export async function getWorkspaces(): Promise<Workspace[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspaces")
    .select("*")
    .order("created_at", { ascending: true });
  return (data ?? []) as Workspace[];
}

// Pick the active workspace from the cookie, falling back to the first one.
export async function resolveActiveWorkspace(
  workspaces: Workspace[],
): Promise<Workspace | null> {
  if (workspaces.length === 0) return null;
  const cookieStore = await cookies();
  const id = cookieStore.get(ACTIVE_WS_COOKIE)?.value;
  return workspaces.find((w) => w.id === id) ?? workspaces[0];
}
