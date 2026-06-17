import Anthropic from "@anthropic-ai/sdk";

// Default to the most capable model. Override with ANTHROPIC_MODEL
// (e.g. claude-sonnet-4-6) for lower cost/latency on a small team.
export const AI_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-4-8";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
