import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createWorkspace } from "@/lib/actions/workspaces";
import type { Workspace } from "@/lib/types";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // If they already have a workspace, skip onboarding.
  const { data: workspaces } = await supabase.from("workspaces").select("id").limit(1);
  if (((workspaces ?? []) as Workspace[]).length > 0) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-sidebar p-8 shadow-sm">
        <div className="mb-6">
          <div className="mb-2 text-3xl">🚀</div>
          <h1 className="text-xl font-semibold">Create your workspace</h1>
          <p className="mt-1 text-sm opacity-60">
            A workspace is your team&apos;s home for projects and tasks.
          </p>
        </div>

        <form action={createWorkspace} className="space-y-3">
          <input
            name="name"
            required
            autoFocus
            placeholder="Acme Inc."
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            Create workspace
          </button>
        </form>
      </div>
    </main>
  );
}
