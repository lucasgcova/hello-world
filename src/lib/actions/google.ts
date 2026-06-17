"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaces, resolveActiveWorkspace } from "@/lib/workspace";
import {
  getValidAccessToken,
  driveSearch,
  type DriveFile,
} from "@/lib/integrations/google";

// Search the active workspace's connected Drive. Tokens are read server-side
// with the service role; the browser never sees them.
export async function driveSearchAction(
  query: string,
): Promise<{ files?: DriveFile[]; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { error: "Server missing SUPABASE_SERVICE_ROLE_KEY." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const ws = await resolveActiveWorkspace(await getWorkspaces());
  if (!ws) return { error: "No workspace" };

  const token = await getValidAccessToken(admin, ws.id);
  if (!token) return { error: "Google isn't connected for this workspace." };

  try {
    return { files: await driveSearch(token, query) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Drive search failed" };
  }
}
