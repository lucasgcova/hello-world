"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Workspace } from "@/lib/types";
import { switchWorkspace, createWorkspaceInApp } from "@/lib/actions/workspaces";

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: Workspace;
  workspaces: Workspace[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  async function select(id: string) {
    setOpen(false);
    if (id === current.id) return;
    await switchWorkspace(id);
    router.push("/");
    router.refresh();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await createWorkspaceInApp(name);
    if (res.id) {
      setCreating(false);
      setName("");
      setOpen(false);
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-black/5 dark:hover:bg-white/5"
      >
        <span className="flex items-center gap-2 truncate">
          <span className="text-lg">🗂️</span>
          <span className="truncate text-sm font-semibold">{current.name}</span>
        </span>
        <span className="text-xs opacity-40">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border bg-background p-1 shadow-lg">
            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => select(w.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/5 ${
                  w.id === current.id ? "font-medium" : ""
                }`}
              >
                <span className="truncate">{w.name}</span>
                {w.id === current.id && <span className="text-xs">✓</span>}
              </button>
            ))}

            <div className="my-1 h-px bg-border" />

            {creating ? (
              <form onSubmit={create} className="p-1">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Workspace name"
                  className="mb-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
                <button
                  type="submit"
                  className="w-full rounded-md bg-indigo-600 px-2 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Create
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm opacity-70 transition hover:bg-black/5 dark:hover:bg-white/5"
              >
                + New workspace
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
