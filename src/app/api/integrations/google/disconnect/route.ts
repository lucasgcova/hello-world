import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaces, resolveActiveWorkspace } from "@/lib/workspace";

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const workspaces = await getWorkspaces();
  const ws = await resolveActiveWorkspace(workspaces);
  if (ws) {
    // RLS requires admin to delete.
    await supabase.from("google_connections").delete().eq("workspace_id", ws.id);
  }
  return NextResponse.redirect(`${origin}/settings/integrations`, {
    status: 303,
  });
}
