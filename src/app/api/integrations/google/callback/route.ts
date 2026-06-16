import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, fetchUserEmail } from "@/lib/integrations/google";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const workspaceId = searchParams.get("state");
  const settings = `${origin}/settings/integrations`;

  if (!code || !workspaceId) {
    return NextResponse.redirect(`${settings}?error=google`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  try {
    const tokens = await exchangeCode(code);
    const email = await fetchUserEmail(tokens.access_token);
    const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Upsert with the user's session → RLS requires workspace admin.
    const { error } = await supabase.from("google_connections").upsert(
      {
        workspace_id: workspaceId,
        email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expiry,
        scope: tokens.scope ?? null,
        connected_by: user.id,
      },
      { onConflict: "workspace_id" },
    );
    if (error) {
      return NextResponse.redirect(
        `${settings}?error=${encodeURIComponent(error.message)}`,
      );
    }
  } catch {
    return NextResponse.redirect(`${settings}?error=google_exchange`);
  }

  return NextResponse.redirect(`${settings}?connected=google`);
}
