import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaces, resolveActiveWorkspace } from "@/lib/workspace";
import { getAuthUrl, googleConfigured } from "@/lib/integrations/google";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  if (!googleConfigured()) {
    return NextResponse.redirect(
      `${origin}/settings/integrations?error=google_not_configured`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const workspaces = await getWorkspaces();
  const ws = await resolveActiveWorkspace(workspaces);
  if (!ws) return NextResponse.redirect(`${origin}/onboarding`);

  // Encode the workspace id in `state` so the callback knows where to store it.
  return NextResponse.redirect(getAuthUrl(ws.id));
}
