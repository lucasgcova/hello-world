import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaces, resolveActiveWorkspace } from "@/lib/workspace";
import type { Project } from "@/lib/types";

// Home: send the user to their first project, or show an empty state.
export default async function Home() {
  const supabase = await createClient();

  const workspaces = await getWorkspaces();
  const ws = await resolveActiveWorkspace(workspaces);
  if (!ws) redirect("/onboarding");

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("workspace_id", ws.id)
    .eq("archived", false)
    .order("position", { ascending: true })
    .limit(1);

  const first = ((projects ?? []) as Project[])[0];
  if (first) redirect(`/projects/${first.id}`);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="text-5xl">🗂️</div>
      <h1 className="text-xl font-semibold">Welcome to {ws.name}</h1>
      <p className="max-w-sm text-sm opacity-60">
        Create your first project from the sidebar to start tracking work.
      </p>
    </div>
  );
}
