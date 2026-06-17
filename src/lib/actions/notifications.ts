"use server";

import { createClient } from "@/lib/supabase/server";

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("notifications").update({ read: true }).eq("id", id);
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);
}
