import type { SupabaseClient } from "@supabase/supabase-js";

// Google (Gmail + Drive) OAuth + capabilities.
//
// One connection per workspace grants both services. Tokens live in the
// google_connections table; callbacks write them with the user's (admin)
// session, while capability calls read/refresh them with the service role.

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string | null;
  expiry?: string | null;
  scope?: string | null;
  email?: string | null;
}

export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}

function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}/api/integrations/google/callback`;
}

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: SCOPES,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  return (await res.json()) as TokenResponse;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`);
  return (await res.json()) as TokenResponse;
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

/**
 * Load a workspace's Google access token, refreshing it if expired. Uses the
 * provided (service-role) client so it can read the admin-only token row.
 * Returns null if the workspace isn't connected.
 */
export async function getValidAccessToken(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("google_connections")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();
  if (!data) return null;
  const conn = data as GoogleTokens & { workspace_id: string };

  const expired =
    conn.expiry != null && new Date(conn.expiry).getTime() < Date.now() + 60_000;

  if (expired && conn.refresh_token) {
    const refreshed = await refreshAccessToken(conn.refresh_token);
    const expiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await admin
      .from("google_connections")
      .update({ access_token: refreshed.access_token, expiry })
      .eq("workspace_id", workspaceId);
    return refreshed.access_token;
  }

  return conn.access_token;
}

// --- Capabilities ----------------------------------------------------------

export interface DriveFile {
  id: string;
  name: string;
  link: string;
  mimeType: string;
}

export async function driveSearch(
  accessToken: string,
  query: string,
  limit = 8,
): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: `name contains '${query.replace(/'/g, "")}' and trashed = false`,
    pageSize: String(limit),
    fields: "files(id,name,mimeType,webViewLink)",
    orderBy: "modifiedTime desc",
  });
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Drive search failed: ${res.status}`);
  const data = (await res.json()) as {
    files?: { id: string; name: string; mimeType: string; webViewLink?: string }[];
  };
  return (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    link: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
  }));
}

export interface EmailSummary {
  id: string;
  snippet: string;
  subject: string;
  from: string;
}

export async function gmailSearch(
  accessToken: string,
  query: string,
  limit = 5,
): Promise<EmailSummary[]> {
  const listParams = new URLSearchParams({ q: query, maxResults: String(limit) });
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listRes.ok) throw new Error(`Gmail search failed: ${listRes.status}`);
  const list = (await listRes.json()) as { messages?: { id: string }[] };

  const out: EmailSummary[] = [];
  for (const m of list.messages ?? []) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!msgRes.ok) continue;
    const msg = (await msgRes.json()) as {
      snippet?: string;
      payload?: { headers?: { name: string; value: string }[] };
    };
    const headers = msg.payload?.headers ?? [];
    out.push({
      id: m.id,
      snippet: msg.snippet ?? "",
      subject: headers.find((h) => h.name === "Subject")?.value ?? "(no subject)",
      from: headers.find((h) => h.name === "From")?.value ?? "",
    });
  }
  return out;
}
