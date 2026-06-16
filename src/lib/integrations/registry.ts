import { slack } from "./slack";
import { gmail } from "./gmail";
import { gdrive } from "./gdrive";
import type {
  IntegrationAdapter,
  IntegrationId,
  IntegrationStatus,
  NotificationPayload,
} from "./types";

// Central registry. Add new adapters here once and everything (settings UI,
// notifications, AI tools) picks them up.
export const adapters: Record<IntegrationId, IntegrationAdapter> = {
  slack,
  gmail,
  gdrive,
};

export function getAdapter(id: IntegrationId): IntegrationAdapter {
  return adapters[id];
}

export function integrationStatuses(): IntegrationStatus[] {
  return Object.values(adapters).map((a) => a.status());
}

/**
 * Best-effort fan-out notification. Sends through every configured adapter and
 * returns per-adapter results. Never throws — a failing integration must not
 * break the primary action that triggered it.
 */
export async function notifyAll(payload: NotificationPayload) {
  const results = await Promise.allSettled(
    Object.values(adapters)
      .filter((a) => a.configured())
      .map(async (a) => ({ id: a.id, result: await a.notify(payload) })),
  );

  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { id: "unknown" as IntegrationId, result: { ok: false, error: String(r.reason) } },
  );
}
