import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaces, resolveActiveWorkspace } from "@/lib/workspace";
import { MembersManager } from "@/components/MembersManager";
import type { WorkspaceInvitation, WorkspaceMember } from "@/lib/types";

export default async function MembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaces = await getWorkspaces();
  const ws = await resolveActiveWorkspace(workspaces);
  if (!ws) redirect("/onboarding");

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("role, user_id, workspace_id, created_at, profile:profiles(*)")
      .eq("workspace_id", ws.id)
      .order("created_at", { ascending: true }),
    // RLS: only admins receive rows here.
    supabase
      .from("workspace_invitations")
      .select("*")
      .eq("workspace_id", ws.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const memberList = (members ?? []) as unknown as WorkspaceMember[];
  const myRole = memberList.find((m) => m.user_id === user.id)?.role ?? "member";
  const isAdmin = myRole === "owner" || myRole === "admin";

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6">
        <Link href="/" className="text-sm opacity-50 hover:opacity-100">
          ← Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Members</h1>
        <p className="mt-1 text-sm opacity-60">
          Manage who has access to <strong>{ws.name}</strong>.
        </p>
      </div>

      <MembersManager
        workspaceId={ws.id}
        members={memberList}
        invitations={(invitations ?? []) as WorkspaceInvitation[]}
        isAdmin={isAdmin}
        currentUserId={user.id}
      />
    </div>
  );
}
