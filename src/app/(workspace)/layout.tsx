import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaces, resolveActiveWorkspace } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import type { Page, Project, Profile } from "@/lib/types";

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

  const workspaces = await getWorkspaces();
  if (workspaces.length === 0) redirect("/onboarding");

  const currentWorkspace = (await resolveActiveWorkspace(workspaces))!;

  const [{ data: projects }, { data: pages }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("workspace_id", currentWorkspace.id)
      .eq("archived", false)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("pages")
      .select("*")
      .eq("workspace_id", currentWorkspace.id)
      .eq("archived", false)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <AppShell
      workspace={currentWorkspace}
      workspaces={workspaces}
      projects={(projects ?? []) as Project[]}
      pages={(pages ?? []) as Page[]}
      profile={(profile ?? null) as Profile | null}
    >
      {children}
    </AppShell>
  );
}
