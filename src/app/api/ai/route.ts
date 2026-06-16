import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, aiConfigured, AI_MODEL } from "@/lib/ai/client";
import { AI_TOOLS, executeTool, systemPrompt, type ToolContext } from "@/lib/ai/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOOL_ITERATIONS = 6;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not set on the server." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as {
    messages: IncomingMessage[];
    projectId?: string | null;
    workspaceId: string;
  };

  if (!body.workspaceId) {
    return Response.json({ error: "workspaceId is required" }, { status: 400 });
  }

  // Resolve names for the system prompt.
  const [{ data: ws }, projectRes] = await Promise.all([
    supabase.from("workspaces").select("name").eq("id", body.workspaceId).single(),
    body.projectId
      ? supabase.from("projects").select("name").eq("id", body.projectId).single()
      : Promise.resolve({ data: null }),
  ]);

  const ctx: ToolContext = {
    supabase,
    userId: user.id,
    workspaceId: body.workspaceId,
    projectId: body.projectId ?? null,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin,
  };

  const system = systemPrompt({
    workspaceName: (ws as { name?: string } | null)?.name,
    projectName: (projectRes.data as { name?: string } | null)?.name ?? null,
  });

  const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const anthropic = getAnthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
          const ms = anthropic.messages.stream({
            model: AI_MODEL,
            max_tokens: 8000,
            thinking: { type: "adaptive" },
            system,
            tools: AI_TOOLS,
            messages,
          });

          ms.on("text", (delta) => send({ type: "text", text: delta }));

          const final = await ms.finalMessage();
          messages.push({ role: "assistant", content: final.content });

          if (final.stop_reason !== "tool_use") break;

          // Execute every tool call, then feed results back.
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type !== "tool_use") continue;
            send({ type: "tool", name: block.name });
            const result = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              ctx,
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
          messages.push({ role: "user", content: toolResults });
        }

        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "AI request failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
