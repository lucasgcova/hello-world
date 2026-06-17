"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  MemberRole,
  WorkspaceInvitation,
  WorkspaceMember,
} from "@/lib/types";
import {
  inviteMember,
  deleteInvitation,
  removeMember,
} from "@/lib/actions/workspaces";

export function MembersManager({
  workspaceId,
  members,
  invitations,
  isAdmin,
  currentUserId,
}: {
  workspaceId: string;
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
  isAdmin: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);

  function inviteLink(token: string) {
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    return `${base}/invite/${token}`;
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard may be blocked; the link is still visible to copy manually
    }
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await inviteMember({ workspaceId, email, role });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.token) {
      const link = inviteLink(res.token);
      setLastLink(link);
      copy(link);
      setEmail("");
      router.refresh();
    }
  }

  async function revoke(id: string) {
    await deleteInvitation({ id });
    router.refresh();
  }

  async function remove(userId: string) {
    await removeMember({ workspaceId, userId });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {isAdmin && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Invite a teammate</h2>
          <form onSubmit={submitInvite} className="flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              className="rounded-lg border bg-background px-2 py-2 text-sm outline-none"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "…" : "Invite"}
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          {lastLink && (
            <div className="mt-3 rounded-lg border bg-sidebar p-3 text-sm">
              <p className="mb-1 font-medium">Invite link copied 🎉</p>
              <p className="mb-2 opacity-60">
                Share this with your teammate. They&apos;ll join after signing in
                with the invited email.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
                  {lastLink}
                </code>
                <button
                  onClick={() => copy(lastLink)}
                  className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium">
          Members <span className="opacity-40">({members.length})</span>
        </h2>
        <div className="overflow-hidden rounded-xl border">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-sm font-medium text-white">
                {(m.profile?.full_name || m.profile?.email || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {m.profile?.full_name || m.profile?.email}
                  {m.user_id === currentUserId && (
                    <span className="ml-2 text-xs opacity-40">you</span>
                  )}
                </div>
                <div className="truncate text-xs opacity-50">
                  {m.profile?.email}
                </div>
              </div>
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs capitalize opacity-70 dark:bg-white/10">
                {m.role}
              </span>
              {isAdmin && m.role !== "owner" && m.user_id !== currentUserId && (
                <button
                  onClick={() => remove(m.user_id)}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {isAdmin && invitations.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">
            Pending invitations{" "}
            <span className="opacity-40">({invitations.length})</span>
          </h2>
          <div className="overflow-hidden rounded-xl border">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{inv.email}</div>
                  <div className="text-xs capitalize opacity-50">{inv.role}</div>
                </div>
                <button
                  onClick={() => copy(inviteLink(inv.token))}
                  className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Copy link
                </button>
                <button
                  onClick={() => revoke(inv.id)}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
