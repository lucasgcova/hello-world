import { createAdminClient } from "@/lib/supabase/admin";
import { verifySlackSignature } from "@/lib/integrations/slackVerify";
import {
  getInstallation,
  createTaskFromSlack,
} from "@/lib/integrations/slackInbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function postReply(channel: string, text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text }),
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  const ok = verifySlackSignature(
    req.headers.get("x-slack-request-timestamp"),
    req.headers.get("x-slack-signature"),
    body,
  );
  if (!ok) return new Response("invalid signature", { status: 401 });

  const payload = JSON.parse(body) as {
    type: string;
    challenge?: string;
    team_id?: string;
    event?: { type: string; text?: string; channel?: string };
  };

  // Slack endpoint verification handshake.
  if (payload.type === "url_verification") {
    return Response.json({ challenge: payload.challenge });
  }

  if (payload.type === "event_callback" && payload.event?.type === "app_mention") {
    const admin = createAdminClient();
    const teamId = payload.team_id ?? "";
    const channel = payload.event.channel ?? "";
    const raw = (payload.event.text ?? "").replace(/<@[^>]+>/g, "").trim();

    if (admin && teamId) {
      const install = await getInstallation(admin, teamId);
      if (install) {
        const [cmd, ...rest] = raw.split(" ");
        const arg = rest.join(" ").trim();
        if (cmd === "add" && arg) {
          const res = await createTaskFromSlack(admin, install, arg);
          if (channel) await postReply(channel, res.message);
        } else if (channel) {
          await postReply(
            channel,
            "Mention me with `add <task title>` to create a task.",
          );
        }
      }
    }
  }

  // Always 200 quickly so Slack doesn't retry.
  return new Response("ok");
}
