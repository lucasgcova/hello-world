"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Project, Profile, Workspace } from "@/lib/types";
import { createProject } from "@/lib/actions/projects";
import { AssistantPanel } from "@/components/AssistantPanel";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";

const EMOJI_CHOICES = ["📋", "🚀", "🛠️", "📈", "🎯", "🧪", "💡", "📦", "🐛", "🎨"];

export function AppShell({
  workspace,
  workspaces,
  projects,
  profile,
  children,
}: {
  workspace: Workspace;
  workspaces: Workspace[];
  projects: Project[];
  profile: Profile | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [showNewProject, setShowNewProject] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📋");
  const [creating, setCreating] = useState(false);

  const currentProjectId = pathname.startsWith("/projects/")
    ? pathname.split("/")[2]
    : null;

  async function submitProject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const res = await createProject({ workspaceId: workspace.id, name, icon });
    setCreating(false);
    if (res.id) {
      setShowNewProject(false);
      setName("");
      setIcon("📋");
      router.push(`/projects/${res.id}`);
      router.refresh();
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
        <div className="px-2 py-2.5">
          <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
        </div>

        <div className="flex items-center justify-between px-4 pb-1 pt-2">
          <span className="text-xs font-medium uppercase tracking-wide opacity-40">
            Projects
          </span>
          <button
            onClick={() => setShowNewProject(true)}
            className="rounded px-1.5 text-lg leading-none opacity-50 transition hover:opacity-100"
            aria-label="New project"
            title="New project"
          >
            +
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {projects.length === 0 && (
            <p className="px-2 py-2 text-xs opacity-40">No projects yet.</p>
          )}
          {projects.map((p) => {
            const active = currentProjectId === p.id;
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className={`mb-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
                  active ? "bg-black/5 font-medium dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <span>{p.icon}</span>
                <span className="truncate">{p.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-2">
          <Link
            href="/settings/members"
            className="mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm opacity-80 transition hover:bg-black/5 dark:hover:bg-white/5"
          >
            <span>👥</span> Members
          </Link>
          <Link
            href="/settings/integrations"
            className="mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm opacity-80 transition hover:bg-black/5 dark:hover:bg-white/5"
          >
            <span>🔌</span> Integrations
          </Link>
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-medium text-white">
                {(profile?.full_name || profile?.email || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <span className="truncate text-xs opacity-70">
                {profile?.full_name || profile?.email}
              </span>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-xs opacity-50 transition hover:opacity-100"
                title="Sign out"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}

        {/* Floating AI assistant button */}
        <button
          onClick={() => setShowAssistant(true)}
          className="absolute bottom-5 right-5 z-20 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition hover:bg-indigo-700"
        >
          ✨ Assistant
        </button>
      </main>

      {/* AI assistant slide-over */}
      {showAssistant && (
        <AssistantPanel
          workspaceId={workspace.id}
          projectId={currentProjectId}
          onClose={() => setShowAssistant(false)}
        />
      )}

      {/* New project modal */}
      {showNewProject && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setShowNewProject(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitProject}
            className="w-full max-w-sm rounded-xl border bg-background p-5 shadow-xl"
          >
            <h2 className="mb-4 text-sm font-semibold">New project</h2>
            <div className="mb-3 flex flex-wrap gap-1">
              {EMOJI_CHOICES.map((e) => (
                <button
                  type="button"
                  key={e}
                  onClick={() => setIcon(e)}
                  className={`rounded-md px-2 py-1 text-lg transition ${
                    icon === e ? "bg-indigo-100 dark:bg-indigo-900/40" : "hover:bg-black/5"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="mb-4 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewProject(false)}
                className="rounded-lg px-3 py-1.5 text-sm opacity-60 hover:opacity-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
