import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Board } from "@/components/Board";
import type { Project, ProjectStatus, Task, WorkspaceMember } from "@/lib/types";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (!project) notFound();
  const p = project as Project;

  const [{ data: statuses }, { data: tasks }, { data: members }] =
    await Promise.all([
      supabase
        .from("project_statuses")
        .select("*")
        .eq("project_id", projectId)
        .order("position", { ascending: true }),
      supabase
        .from("tasks")
        .select("*, assignee:profiles(*)")
        .eq("project_id", projectId)
        .order("position", { ascending: true }),
      supabase
        .from("workspace_members")
        .select("user_id, role, workspace_id, created_at, profile:profiles(*)")
        .eq("workspace_id", p.workspace_id),
    ]);

  return (
    <Board
      project={p}
      statuses={(statuses ?? []) as ProjectStatus[]}
      tasks={(tasks ?? []) as unknown as Task[]}
      members={(members ?? []) as unknown as WorkspaceMember[]}
    />
  );
}
