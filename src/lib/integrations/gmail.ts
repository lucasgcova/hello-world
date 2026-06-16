import type {
  IntegrationAdapter,
  IntegrationStatus,
  NotificationPayload,
  NotifyResult,
} from "./types";

// Gmail adapter — STUB.
//
// Implements the common interface so it's a drop-in once wired. To finish:
//   1. Create a Google Cloud OAuth app, request the gmail.send / gmail.readonly
//      scopes, store per-workspace tokens in the `integrations` table.
//   2. Replace the bodies below with Gmail API calls (e.g. users.messages.send,
//      users.messages.list) using the googleapis client.
//   3. Add capability methods (searchThreads, sendEmail, …) as you need them.
class GmailAdapter implements IntegrationAdapter {
  id = "gmail" as const;
  name = "Gmail";

  configured(): boolean {
    return false;
  }

  status(): IntegrationStatus {
    return {
      id: this.id,
      name: this.name,
      configured: false,
      note: "Not yet wired. Add Google OAuth credentials and implement src/lib/integrations/gmail.ts.",
    };
  }

  async notify(_payload: NotificationPayload): Promise<NotifyResult> {
    void _payload;
    return { ok: false, skipped: true, error: "Gmail integration not implemented" };
  }

  // --- Capability stubs (throw until implemented) ---------------------------
  async searchThreads(_query: string): Promise<never> {
    throw new Error("Gmail.searchThreads not implemented");
  }

  async sendEmail(_to: string, _subject: string, _body: string): Promise<never> {
    throw new Error("Gmail.sendEmail not implemented");
  }
}

export const gmail = new GmailAdapter();
