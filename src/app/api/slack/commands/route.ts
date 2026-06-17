import { createAdminClient } from "@/lib/supabase/admin";
import { verifySlackSignature } from "@/lib/integrations/slackVerify";
import {
  getInstallation,
  createTaskFromSlack,
  listTasksFromSlack,
} from "@/lib/integrations/slackInbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ephemeral(text: string) {
  return Response.json({ response_type: "ephemeral", text });
}

const HELP =
  "Usage:\n• `/teamspace add <task title>` — create a task\n• `/teamspace list` — show open tasks";

export async function POST(req: Request) {
  const body = await req.text();
  const ok = verifySlackSignature(
    req.headers.get("x-slack-request-timestamp"),
    req.headers.get("x-slack-signature"),
    body,
  );
  if (!ok) return new Response("invalid signature", { status: 401 });

  const params = new URLSearchParams(body);
  const teamId = params.get("team_id") ?? "";
  const text = (params.get("text") ?? "").trim();

  const admin = createAdminClient();
  if (!admin) {
    return ephemeral("TeamSpace server is missing its service role key.");
  }

  const install = await getInstallation(admin, teamId);
  if (!install) {
    return ephemeral(
      "This Slack workspace isn't linked to TeamSpace yet. Ask an admin to link it in Settings → Integrations.",
    );
  }

  const [command, ...rest] = text.split(" ");
  const arg = rest.join(" ").trim();

  if (command === "add") {
    if (!arg) return ephemeral("What should the task be? `/teamspace add <title>`");
    const res = await createTaskFromSlack(admin, install, arg);
    return ephemeral(res.message);
  }
  if (command === "list") {
    return ephemeral(await listTasksFromSlack(admin, install));
  }
  return ephemeral(HELP);
}
