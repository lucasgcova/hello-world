import type {
  IntegrationAdapter,
  IntegrationStatus,
  NotificationPayload,
  NotifyResult,
} from "./types";

// Google Drive adapter — STUB.
//
// Implements the common interface so it's a drop-in once wired. To finish:
//   1. Reuse the Google OAuth app (request drive.readonly / drive.file scopes).
//   2. Replace the bodies below with Drive API calls (files.list, files.get).
//   3. Add capability methods (searchFiles, attachFileToTask, …) as needed.
class DriveAdapter implements IntegrationAdapter {
  id = "gdrive" as const;
  name = "Google Drive";

  configured(): boolean {
    return false;
  }

  status(): IntegrationStatus {
    return {
      id: this.id,
      name: this.name,
      configured: false,
      note: "Not yet wired. Add Google OAuth credentials and implement src/lib/integrations/gdrive.ts.",
    };
  }

  async notify(_payload: NotificationPayload): Promise<NotifyResult> {
    void _payload;
    return { ok: false, skipped: true, error: "Drive integration not implemented" };
  }

  // --- Capability stubs (throw until implemented) ---------------------------
  async searchFiles(_query: string): Promise<never> {
    throw new Error("Drive.searchFiles not implemented");
  }
}

export const gdrive = new DriveAdapter();
