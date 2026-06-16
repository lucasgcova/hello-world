// Common shape for all external integrations.
//
// v1 wires Slack for real (notifications). Gmail and Drive ship as stubs that
// implement the same interface, so filling them in later is a localized change
// — no call sites need to move.

export type IntegrationId = "slack" | "gmail" | "gdrive";

export interface IntegrationStatus {
  id: IntegrationId;
  name: string;
  /** True when the integration has the config/credentials it needs to run. */
  configured: boolean;
  /** Short human-readable note for the settings UI. */
  note: string;
}

export interface NotificationPayload {
  text: string;
  title?: string;
  url?: string;
}

export interface NotifyResult {
  ok: boolean;
  error?: string;
  /** True when the adapter is a stub / not yet implemented. */
  skipped?: boolean;
}

/**
 * Every integration adapter can, at minimum, report status and deliver a
 * notification. Adapters add capability-specific methods on top of this.
 */
export interface IntegrationAdapter {
  id: IntegrationId;
  name: string;
  configured(): boolean;
  status(): IntegrationStatus;
  notify(payload: NotificationPayload): Promise<NotifyResult>;
}
