// Domain types used across the UI and server code.
//
// These mirror the Postgres schema in supabase/migrations. For fully generated,
// always-in-sync types run `npm run db:types` once your Supabase project is
// linked (writes src/lib/supabase/database.types.ts), then layer those in.

export type MemberRole = "owner" | "admin" | "member";
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";
export type IntegrationType = "slack" | "gmail" | "gdrive";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
  profile?: Profile;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  archived: boolean;
  position: number;
  created_by: string;
  created_at: string;
}

export interface ProjectStatus {
  id: string;
  project_id: string;
  name: string;
  color: string;
  position: number;
  is_done: boolean;
  created_at: string;
}

export interface Label {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  status_id: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  assignee_id: string | null;
  due_date: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  // Hydrated relations (optional, depending on the query)
  assignee?: Profile | null;
  labels?: Label[];
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: Profile | null;
}

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  email: string;
  role: MemberRole;
  token: string;
  invited_by: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface Integration {
  id: string;
  workspace_id: string;
  type: IntegrationType;
  config: Record<string, unknown>;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "todo"
  | "quote"
  | "code"
  | "divider";

export interface Block {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
}

export interface Page {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  title: string;
  icon: string;
  content: Block[];
  position: number;
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; color: string; rank: number }
> = {
  urgent: { label: "Urgent", color: "#ef4444", rank: 4 },
  high: { label: "High", color: "#f97316", rank: 3 },
  medium: { label: "Medium", color: "#eab308", rank: 2 },
  low: { label: "Low", color: "#3b82f6", rank: 1 },
  none: { label: "No priority", color: "#94a3b8", rank: 0 },
};
