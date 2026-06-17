import type {
  IntegrationAdapter,
  IntegrationStatus,
  NotificationPayload,
  NotifyResult,
} from "./types";

// Real Slack adapter.
//
// Prefers an incoming webhook (simplest: one URL, no scopes). Falls back to a
// bot token + channel via chat.postMessage. Configure via env:
//   SLACK_WEBHOOK_URL      (recommended)
//   SLACK_BOT_TOKEN + SLACK_DEFAULT_CHANNEL
class SlackAdapter implements IntegrationAdapter {
  id = "slack" as const;
  name = "Slack";

  private webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim() || "";
  private botToken = process.env.SLACK_BOT_TOKEN?.trim() || "";
  private channel = process.env.SLACK_DEFAULT_CHANNEL?.trim() || "#general";

  configured(): boolean {
    return Boolean(this.webhookUrl || this.botToken);
  }

  status(): IntegrationStatus {
    return {
      id: this.id,
      name: this.name,
      configured: this.configured(),
      note: this.configured()
        ? this.webhookUrl
          ? "Connected via incoming webhook."
          : `Connected via bot token (default channel ${this.channel}).`
        : "Set SLACK_WEBHOOK_URL (or SLACK_BOT_TOKEN) to enable Slack notifications.",
    };
  }

  async notify(payload: NotificationPayload): Promise<NotifyResult> {
    if (!this.configured()) {
      return { ok: false, skipped: true, error: "Slack not configured" };
    }

    const text = this.format(payload);

    try {
      if (this.webhookUrl) {
        const res = await fetch(this.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          return { ok: false, error: `Slack webhook returned ${res.status}` };
        }
        return { ok: true };
      }

      // Bot token path.
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${this.botToken}`,
        },
        body: JSON.stringify({ channel: this.channel, text }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      return data.ok ? { ok: true } : { ok: false, error: data.error };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Slack error" };
    }
  }

  private format(payload: NotificationPayload): string {
    const parts: string[] = [];
    if (payload.title) parts.push(`*${payload.title}*`);
    parts.push(payload.text);
    if (payload.url) parts.push(`<${payload.url}>`);
    return parts.join("\n");
  }
}

export const slack = new SlackAdapter();
