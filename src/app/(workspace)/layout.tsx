import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import type { Project, Profile, WorkspaceMember, Workspace } from "@/lib/types";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // RLS scopes this to workspaces the user belongs to.
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("*")
    .order("created_at", { ascending: true });

  const list = (workspaces ?? []) as Workspace[];
  if (list.length === 0) redirect("/onboarding");

  const currentWorkspace = list[0];

  const [{ data: projects }, { data: members }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("workspace_id", currentWorkspace.id)
      .eq("archived", false)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("workspace_members")
      .select("role, user_id, workspace_id, created_at, profile:profiles(*)")
      .eq("workspace_id", currentWorkspace.id),
  ]);

  return (
    <AppShell
      workspace={currentWorkspace}
      projects={(projects ?? []) as Project[]}
      members={(members ?? []) as unknown as WorkspaceMember[]}
      profile={(profile ?? null) as Profile | null}
    >
      {children}
    </AppShell>
  );
}
