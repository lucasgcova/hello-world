import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAll } from "@/lib/integrations/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getValidAccessToken,
  driveSearch,
  gmailSearch,
  gmailSend,
} from "@/lib/integrations/google";
import type { TaskPriority } from "@/lib/types";

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  workspaceId: string;
  projectId: string | null;
  siteUrl: string;
}

// Tool definitions exposed to Claude. Descriptions are prescriptive about WHEN
// to call each tool — recent models reach for tools conservatively otherwise.
export const AI_TOOLS: Anthropic.Tool[] = [
  {
    name: "create_task",
    description:
      "Create a new task in the current project. Call this whenever the user asks to add, create, or capture a task, to-do, action item, or follow-up. Prefer one call per task when several are requested.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task title." },
        description: { type: "string", description: "Optional longer details." },
        priority: {
          type: "string",
          enum: ["none", "low", "medium", "high", "urgent"],
          description: "Task priority. Default 'none'.",
        },
        status_name: {
          type: "string",
          description:
            "Target column/status name (e.g. 'To do', 'In progress'). Defaults to the first column.",
        },
        due_date: {
          type: "string",
          description: "Optional due date in YYYY-MM-DD format.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "list_tasks",
    description:
      "List tasks in the current project, optionally filtered by status. Call this when the user asks what's on the board, wants a summary/status update, or asks about open work.",
    input_schema: {
      type: "object",
      properties: {
        status_name: {
          type: "string",
          description: "Optional column/status name to filter by.",
        },
      },
      required: [],
    },
  },
  {
    name: "update_task_status",
    description:
      "Move a task to a different column/status. Call this when the user asks to move, complete, start, or change the status of an existing task.",
    input_schema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The task title (or part of it) or its id.",
        },
        status_name: {
          type: "string",
          description: "The target column/status name.",
        },
      },
      required: ["task", "status_name"],
    },
  },
  {
    name: "search_drive",
    description:
      "Search the team's connected Google Drive for files by name. Call this when the user asks to find a doc, spreadsheet, or file, or references something likely stored in Drive.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms (file name)." },
      },
      required: ["query"],
    },
  },
  {
    name: "search_email",
    description:
      "Search the connected Gmail account. Call this when the user asks about recent emails or wants context from email threads. Uses Gmail search syntax (e.g. 'from:alice newer_than:7d').",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query." },
      },
      required: ["query"],
    },
  },
  {
    name: "send_email",
    description:
      "Send an email from the connected Gmail account. Only call this when the user explicitly asks to send or email someone, and you have a clear recipient, subject, and body. Confirm details with the user first if anything is ambiguous.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address." },
        subject: { type: "string", description: "Email subject." },
        body: { type: "string", description: "Plain-text email body." },
      },
      required: ["to", "subject", "body"],
    },
  },
];

const TASK_TOOLS = new Set(["create_task", "list_tasks", "update_task_status"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveStatus(ctx: ToolContext, name?: string) {
  if (!ctx.projectId) return null;
  const { data } = await ctx.supabase
    .from("project_statuses")
    .select("id, name, position, is_done")
    .eq("project_id", ctx.projectId)
    .order("position", { ascending: true });

  const statuses = (data ?? []) as {
    id: string;
    name: string;
    position: number;
    is_done: boolean;
  }[];
  if (statuses.length === 0) return null;
  if (!name) return statuses[0];
  const match = statuses.find(
    (s) => s.name.toLowerCase() === name.toLowerCase(),
  );
  return match ?? statuses[0];
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (TASK_TOOLS.has(name) && !ctx.projectId) {
    return "No project is currently open. Ask the user to open a project first.";
  }

  try {
    switch (name) {
      case "create_task": {
        const status = await resolveStatus(ctx, input.status_name as string);
        const { data: maxRows } = await ctx.supabase
          .from("tasks")
          .select("position")
          .eq("project_id", ctx.projectId)
          .order("position", { ascending: false })
          .limit(1);
        const nextPos =
          ((maxRows?.[0] as { position?: number })?.position ?? 0) + 1000;

        const { data, error } = await ctx.supabase
          .from("tasks")
          .insert({
            project_id: ctx.projectId,
            status_id: status?.id ?? null,
            title: String(input.title),
            description: (input.description as string) ?? null,
            priority: ((input.priority as TaskPriority) ?? "none") as TaskPriority,
            due_date: (input.due_date as string) ?? null,
            position: nextPos,
            created_by: ctx.userId,
          })
          .select("id, title")
          .single();

        if (error) return `Failed to create task: ${error.message}`;

        // Best-effort notification — never blocks task creation.
        void notifyAll({
          title: "New task (via AI assistant)",
          text: `“${input.title}” was added to the board.`,
          url: `${ctx.siteUrl}/projects/${ctx.projectId}`,
        });

        return `Created task "${(data as { title: string }).title}"${
          status ? ` in "${status.name}"` : ""
        }.`;
      }

      case "list_tasks": {
        const status = input.status_name
          ? await resolveStatus(ctx, input.status_name as string)
          : null;

        let query = ctx.supabase
          .from("tasks")
          .select("id, title, priority, due_date, status_id")
          .eq("project_id", ctx.projectId)
          .order("position", { ascending: true });
        if (status) query = query.eq("status_id", status.id);

        const { data, error } = await query;
        if (error) return `Failed to list tasks: ${error.message}`;

        const tasks = (data ?? []) as {
          title: string;
          priority: string;
          due_date: string | null;
        }[];
        if (tasks.length === 0) return "No tasks found.";

        return tasks
          .map(
            (t) =>
              `- ${t.title} [${t.priority}]${t.due_date ? ` due ${t.due_date}` : ""}`,
          )
          .join("\n");
      }

      case "update_task_status": {
        const status = await resolveStatus(ctx, input.status_name as string);
        if (!status) return `Status "${input.status_name}" not found.`;

        const taskRef = String(input.task);
        let taskId: string | null = null;

        if (UUID_RE.test(taskRef)) {
          taskId = taskRef;
        } else {
          const { data } = await ctx.supabase
            .from("tasks")
            .select("id, title")
            .eq("project_id", ctx.projectId)
            .ilike("title", `%${taskRef}%`)
            .limit(1);
          taskId = (data?.[0] as { id?: string })?.id ?? null;
        }

        if (!taskId) return `Could not find a task matching "${taskRef}".`;

        const { error } = await ctx.supabase
          .from("tasks")
          .update({ status_id: status.id })
          .eq("id", taskId);
        if (error) return `Failed to update task: ${error.message}`;

        return `Moved task to "${status.name}".`;
      }

      case "search_drive":
      case "search_email":
      case "send_email": {
        const admin = createAdminClient();
        if (!admin) {
          return "Google features aren't available — the server is missing SUPABASE_SERVICE_ROLE_KEY.";
        }
        const token = await getValidAccessToken(admin, ctx.workspaceId);
        if (!token) {
          return "Google isn't connected for this workspace. Connect it in Settings → Integrations.";
        }

        if (name === "send_email") {
          await gmailSend(
            token,
            String(input.to),
            String(input.subject),
            String(input.body),
          );
          return `Email sent to ${input.to}.`;
        }

        const query = String(input.query ?? "");

        if (name === "search_drive") {
          const files = await driveSearch(token, query);
          if (files.length === 0) return "No matching Drive files.";
          return files.map((f) => `- ${f.name} — ${f.link}`).join("\n");
        }

        const emails = await gmailSearch(token, query);
        if (emails.length === 0) return "No matching emails.";
        return emails
          .map((e) => `- ${e.subject} (from ${e.from})\n  ${e.snippet}`)
          .join("\n");
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function systemPrompt(ctx: {
  workspaceName?: string;
  projectName?: string | null;
}): string {
  return [
    "You are TeamSpace Assistant, an AI project-management helper embedded in a Notion-style app for a small team.",
    "You help users manage their board: creating tasks, summarizing status, and moving work along.",
    ctx.projectName
      ? `The user currently has the project "${ctx.projectName}" open. Task tools act on this project.`
      : "No project is currently open.",
    "Use the provided tools to take actions rather than only describing them. After acting, confirm concisely what you did.",
    "When summarizing the board, call list_tasks first, then give a crisp, well-organized summary grouped by status or priority.",
    "Keep replies short and skimmable. Lead with the outcome.",
  ]
    .filter(Boolean)
    .join(" ");
}
