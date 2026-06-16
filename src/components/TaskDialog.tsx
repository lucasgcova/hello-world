"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addComment } from "@/lib/actions/tasks";
import { setTaskLabels, createLabel } from "@/lib/actions/labels";
import {
  PRIORITY_META,
  type Comment,
  type Label,
  type Profile,
  type ProjectStatus,
  type Task,
  type TaskPriority,
} from "@/lib/types";

const PRIORITY_ORDER: TaskPriority[] = [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
];

export function TaskDialog({
  task,
  statuses,
  assignees,
  labels,
  projectId,
  workspaceId,
  onClose,
  onSaved,
  onDeleted,
}: {
  task: Task;
  statuses: ProjectStatus[];
  assignees: Profile[];
  labels: Label[];
  projectId: string;
  workspaceId: string;
  onClose: () => void;
  onSaved: (t: Task) => void;
  onDeleted: (id: string) => void;
}) {
  const supabase = createClient();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assigneeId, setAssigneeId] = useState(task.assignee_id ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [statusId, setStatusId] = useState(task.status_id ?? "");

  const [available, setAvailable] = useState<Label[]>(labels);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>(
    (task.labels ?? []).map((l) => l.id),
  );
  const [newLabel, setNewLabel] = useState("");

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);

  const isTemp = task.id.startsWith("temp-");

  useEffect(() => {
    if (isTemp) {
      setLoadingComments(false);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("comments")
        .select("*, author:profiles(*)")
        .eq("task_id", task.id)
        .order("created_at", { ascending: true });
      if (active) {
        setComments((data ?? []) as unknown as Comment[]);
        setLoadingComments(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [task.id, isTemp, supabase]);

  function toggleLabel(id: string) {
    setSelectedLabelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function addNewLabel() {
    const name = newLabel.trim();
    if (!name) return;
    setNewLabel("");
    const res = await createLabel({ workspaceId, name, projectId });
    if (res.id) {
      const created: Label = {
        id: res.id,
        workspace_id: workspaceId,
        name,
        color: "#64748b",
        created_at: new Date().toISOString(),
      };
      setAvailable((prev) => [...prev, created]);
      setSelectedLabelIds((prev) => [...prev, created.id]);
    }
  }

  async function save() {
    const assignee = assignees.find((a) => a.id === assigneeId) ?? null;
    const selectedLabels = available.filter((l) =>
      selectedLabelIds.includes(l.id),
    );
    if (!isTemp) {
      await setTaskLabels({ taskId: task.id, projectId, labelIds: selectedLabelIds });
    }
    onSaved({
      ...task,
      title: title.trim() || "Untitled task",
      description: description.trim() || null,
      priority,
      assignee_id: assigneeId || null,
      due_date: dueDate || null,
      status_id: statusId || null,
      assignee,
      labels: selectedLabels,
    });
  }

  async function postComment() {
    if (!commentBody.trim() || isTemp) return;
    const body = commentBody.trim();
    setCommentBody("");
    await addComment({ taskId: task.id, projectId, body });
    const { data } = await supabase
      .from("comments")
      .select("*, author:profiles(*)")
      .eq("task_id", task.id)
      .order("created_at", { ascending: true });
    setComments((data ?? []) as unknown as Comment[]);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <span className="text-xs uppercase tracking-wide opacity-40">Task</span>
          <button
            onClick={onClose}
            className="rounded px-2 text-lg leading-none opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-0 overflow-y-auto md:grid-cols-[1fr_240px]">
          {/* Main */}
          <div className="border-b p-5 md:border-b-0 md:border-r">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={save}
              className="mb-4 w-full bg-transparent text-lg font-semibold outline-none"
            />
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide opacity-40">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={save}
              rows={5}
              placeholder="Add details…"
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
            />

            {/* Comments */}
            <div className="mt-6">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide opacity-40">
                Comments
              </h3>
              {isTemp ? (
                <p className="text-sm opacity-40">
                  Save the task to add comments.
                </p>
              ) : loadingComments ? (
                <p className="text-sm opacity-40">Loading…</p>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="text-sm">
                      <div className="mb-0.5 text-xs opacity-50">
                        {c.author?.full_name || c.author?.email || "Someone"}
                      </div>
                      <div className="whitespace-pre-wrap rounded-lg bg-black/5 px-3 py-2 dark:bg-white/5">
                        {c.body}
                      </div>
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <p className="text-sm opacity-40">No comments yet.</p>
                  )}
                </div>
              )}

              {!isTemp && (
                <div className="mt-3 flex gap-2">
                  <input
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        postComment();
                      }
                    }}
                    placeholder="Write a comment…"
                    className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                  <button
                    onClick={postComment}
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar properties */}
          <div className="space-y-4 p-5">
            <Field label="Status">
              <select
                value={statusId}
                onChange={(e) => setStatusId(e.target.value)}
                className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm outline-none"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm outline-none"
              >
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Assignee">
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm outline-none"
              >
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name || a.email}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Due date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm outline-none"
              />
            </Field>

            <Field label="Labels">
              <div className="flex flex-wrap gap-1">
                {available.map((l) => {
                  const on = selectedLabelIds.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleLabel(l.id)}
                      className="rounded px-1.5 py-0.5 text-[11px] font-medium transition"
                      style={{
                        background: on ? `${l.color}22` : "transparent",
                        color: on ? l.color : undefined,
                        border: `1px solid ${on ? l.color : "var(--border)"}`,
                        opacity: on ? 1 : 0.6,
                      }}
                    >
                      {l.name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-1">
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addNewLabel();
                    }
                  }}
                  placeholder="New label"
                  className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
                <button
                  type="button"
                  onClick={addNewLabel}
                  className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Add
                </button>
              </div>
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3">
          <button
            onClick={() => onDeleted(task.id)}
            className="text-sm text-red-500 hover:text-red-600"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm opacity-60 hover:opacity-100"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide opacity-40">
        {label}
      </label>
      {children}
    </div>
  );
}
