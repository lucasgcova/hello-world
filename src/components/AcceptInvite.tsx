"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "@/lib/actions/workspaces";

export function AcceptInvite({
  token,
  workspaceName,
  invitedEmail,
  accepted,
  userEmail,
}: {
  token: string;
  workspaceName: string | null;
  invitedEmail: string | null;
  accepted: boolean;
  userEmail: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const card =
    "w-full max-w-sm rounded-2xl border bg-sidebar p-8 text-center shadow-sm";

  if (!workspaceName) {
    return (
      <div className={card}>
        <div className="mb-2 text-3xl">🤷</div>
        <h1 className="text-lg font-semibold">Invitation not found</h1>
        <p className="mt-1 text-sm opacity-60">
          This invite link is invalid or has been revoked.
        </p>
        <a
          href="/"
          className="mt-4 inline-block rounded-lg border px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
        >
          Go home
        </a>
      </div>
    );
  }

  const emailMismatch =
    invitedEmail && userEmail &&
    invitedEmail.toLowerCase() !== userEmail.toLowerCase();

  async function accept() {
    setError(null);
    setBusy(true);
    const res = await acceptInvitation(token);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className={card}>
      <div className="mb-2 text-3xl">📨</div>
      <h1 className="text-lg font-semibold">
        Join {workspaceName}
      </h1>
      <p className="mt-1 text-sm opacity-60">
        You&apos;ve been invited to collaborate{invitedEmail ? ` as ${invitedEmail}` : ""}.
      </p>

      {accepted ? (
        <p className="mt-4 text-sm opacity-70">
          This invitation has already been used.
        </p>
      ) : emailMismatch ? (
        <p className="mt-4 rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          This invite was sent to <strong>{invitedEmail}</strong>, but you&apos;re
          signed in as <strong>{userEmail}</strong>. Sign in with the invited
          address to accept.
        </p>
      ) : (
        <button
          onClick={accept}
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Joining…" : "Join workspace"}
        </button>
      )}

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </div>
  );
}
