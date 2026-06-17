import type { SupabaseClient } from "@supabase/supabase-js";

// Insert in-app notifications for a set of recipients, skipping the actor and
// de-duplicating. Best-effort: callers should not block on the result.
export async function createNotifications(
  supabase: SupabaseClient,
  recipients: (string | null | undefined)[],
  opts: {
    workspaceId: string;
    actorId: string;
    type: string;
    body: string;
    link?: string;
  },
) {
  const unique = Array.from(new Set(recipients)).filter(
    (r): r is string => Boolean(r) && r !== opts.actorId,
  );
  if (unique.length === 0) return;

  await supabase.from("notifications").insert(
    unique.map((user_id) => ({
      user_id,
      workspace_id: opts.workspaceId,
      actor_id: opts.actorId,
      type: opts.type,
      body: opts.body,
      link: opts.link ?? null,
    })),
  );
}

export async function actorName(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .single();
  const p = data as { full_name?: string; email?: string } | null;
  return p?.full_name || p?.email || "Someone";
}
