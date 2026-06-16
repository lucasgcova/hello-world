import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Board } from "@/components/Board";
import type {
  Label,
  Project,
  ProjectStatus,
  ProjectView,
  Task,
  WorkspaceMember,
} from "@/lib/types";

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

  const [
    { data: statuses },
    { data: tasks },
    { data: members },
    { data: labels },
    { data: views },
  ] = await Promise.all([
    supabase
      .from("project_statuses")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
    supabase
      .from("tasks")
      .select("*, assignee:profiles(*), task_labels(label:labels(*))")
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
    supabase
      .from("workspace_members")
      .select("user_id, role, workspace_id, created_at, profile:profiles(*)")
      .eq("workspace_id", p.workspace_id),
    supabase
      .from("labels")
      .select("*")
      .eq("workspace_id", p.workspace_id)
      .order("name", { ascending: true }),
    supabase
      .from("project_views")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
  ]);

  // Flatten nested task_labels → task.labels
  const hydratedTasks = ((tasks ?? []) as unknown as (Task & {
    task_labels?: { label: Label }[];
  })[]).map((t) => ({
    ...t,
    labels: (t.task_labels ?? []).map((tl) => tl.label).filter(Boolean),
  })) as Task[];

  return (
    <Board
      project={p}
      statuses={(statuses ?? []) as ProjectStatus[]}
      tasks={hydratedTasks}
      members={(members ?? []) as unknown as WorkspaceMember[]}
      labels={(labels ?? []) as Label[]}
      views={(views ?? []) as ProjectView[]}
    />
  );
}
