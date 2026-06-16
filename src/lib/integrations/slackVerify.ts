import crypto from "crypto";

// Verify a Slack request signature (https://api.slack.com/authentication/verifying-requests-from-slack).
// `body` must be the raw request body string.
export function verifySlackSignature(
  timestamp: string | null,
  signature: string | null,
  body: string,
): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !timestamp || !signature) return false;

  // Reject requests older than 5 minutes (replay protection).
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const base = `v0:${timestamp}:${body}`;
  const computed =
    "v0=" + crypto.createHmac("sha256", secret).update(base).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}
