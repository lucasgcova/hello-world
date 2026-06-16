"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PRIORITY_META,
  type Project,
  type ProjectStatus,
  type Task,
  type TaskPriority,
  type WorkspaceMember,
  type Profile,
} from "@/lib/types";
import {
  createTask,
  updateTask,
  moveTask,
  deleteTask,
} from "@/lib/actions/tasks";
import { TaskDialog } from "@/components/TaskDialog";

type View = "board" | "list" | "table";

export function Board({
  project,
  statuses,
  tasks: initialTasks,
  members,
}: {
  project: Project;
  statuses: ProjectStatus[];
  tasks: Task[];
  members: WorkspaceMember[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [view, setView] = useState<View>("board");
  const [selected, setSelected] = useState<Task | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const assignees = useMemo(
    () => members.map((m) => m.profile).filter(Boolean) as Profile[],
    [members],
  );

  const firstStatusId = statuses[0]?.id ?? null;

  function tasksFor(statusId: string) {
    return tasks
      .filter(
        (t) =>
          t.status_id === statusId ||
          (t.status_id === null && statusId === firstStatusId),
      )
      .sort((a, b) => a.position - b.position);
  }

  function patchLocal(id: string, patch: Partial<Task>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function handleDrop(statusId: string) {
    if (!dragId) return;
    const id = dragId;
    setDragId(null);
    const colTasks = tasksFor(statusId);
    const nextPos =
      (colTasks[colTasks.length - 1]?.position ?? 0) + 1000;
    patchLocal(id, { status_id: statusId, position: nextPos });
    const res = await moveTask({
      id,
      projectId: project.id,
      statusId,
      position: nextPos,
    });
    if (res.error) router.refresh();
  }

  async function addTask(statusId: string, title: string) {
    const temp: Task = {
      id: `temp-${Date.now()}`,
      project_id: project.id,
      status_id: statusId,
      title,
      description: null,
      priority: "none",
      assignee_id: null,
      due_date: null,
      position: (tasksFor(statusId).slice(-1)[0]?.position ?? 0) + 1000,
      created_by: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };
    setTasks((prev) => [...prev, temp]);
    const res = await createTask({ projectId: project.id, statusId, title });
    if (res.id) {
      patchLocal(temp.id, { id: res.id });
    } else {
      setTasks((prev) => prev.filter((t) => t.id !== temp.id));
    }
  }

  async function onDeleted(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setSelected(null);
    await deleteTask({ id, projectId: project.id });
  }

  async function onSaved(updated: Task) {
    patchLocal(updated.id, updated);
    setSelected(null);
    await updateTask({
      id: updated.id,
      projectId: project.id,
      title: updated.title,
      description: updated.description,
      priority: updated.priority,
      assigneeId: updated.assignee_id,
      dueDate: updated.due_date,
      statusId: updated.status_id,
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{project.icon}</span>
          <h1 className="text-base font-semibold">{project.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-1.5">
            {assignees.slice(0, 5).map((p) => (
              <Avatar key={p.id} profile={p} />
            ))}
          </div>
          <div className="flex rounded-lg border p-0.5 text-xs">
            {(["board", "list", "table"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1 capitalize transition ${
                  view === v
                    ? "bg-black/5 font-medium dark:bg-white/10"
                    : "opacity-60 hover:opacity-100"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {view === "board" && (
          <BoardView
            statuses={statuses}
            tasksFor={tasksFor}
            onAdd={addTask}
            onOpen={setSelected}
            dragId={dragId}
            setDragId={setDragId}
            onDrop={handleDrop}
          />
        )}
        {view === "list" && (
          <ListView
            statuses={statuses}
            tasksFor={tasksFor}
            onOpen={setSelected}
          />
        )}
        {view === "table" && (
          <TableView
            tasks={tasks}
            statuses={statuses}
            onOpen={setSelected}
          />
        )}
      </div>

      {selected && (
        <TaskDialog
          task={selected}
          statuses={statuses}
          assignees={assignees}
          projectId={project.id}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board (Kanban) view
// ---------------------------------------------------------------------------
function BoardView({
  statuses,
  tasksFor,
  onAdd,
  onOpen,
  dragId,
  setDragId,
  onDrop,
}: {
  statuses: ProjectStatus[];
  tasksFor: (statusId: string) => Task[];
  onAdd: (statusId: string, title: string) => void;
  onOpen: (t: Task) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDrop: (statusId: string) => void;
}) {
  return (
    <div className="scrollbar-thin flex h-full gap-3 overflow-x-auto p-4">
      {statuses.map((s) => (
        <Column
          key={s.id}
          status={s}
          tasks={tasksFor(s.id)}
          onAdd={onAdd}
          onOpen={onOpen}
          dragId={dragId}
          setDragId={setDragId}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
}

function Column({
  status,
  tasks,
  onAdd,
  onOpen,
  dragId,
  setDragId,
  onDrop,
}: {
  status: ProjectStatus;
  tasks: Task[];
  onAdd: (statusId: string, title: string) => void;
  onOpen: (t: Task) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDrop: (statusId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [over, setOver] = useState(false);

  function submit() {
    if (title.trim()) onAdd(status.id, title.trim());
    setTitle("");
    setAdding(false);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={() => {
        setOver(false);
        onDrop(status.id);
      }}
      className={`flex w-72 shrink-0 flex-col rounded-xl border bg-sidebar/60 transition ${
        over ? "ring-2 ring-indigo-400/50" : ""
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: status.color }}
          />
          <span className="text-sm font-medium">{status.name}</span>
          <span className="text-xs opacity-40">{tasks.length}</span>
        </div>
      </div>

      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            onOpen={onOpen}
            dragging={dragId === t.id}
            onDragStart={() => setDragId(t.id)}
            onDragEnd={() => setDragId(null)}
          />
        ))}

        {adding ? (
          <textarea
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") {
                setTitle("");
                setAdding(false);
              }
            }}
            rows={2}
            placeholder="Task title…"
            className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-lg px-3 py-1.5 text-left text-sm opacity-50 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5"
          >
            + Add task
          </button>
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onOpen,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  onOpen: (t: Task) => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
      className={`cursor-pointer rounded-lg border bg-background p-3 text-sm shadow-sm transition hover:border-indigo-300 ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="mb-1.5 leading-snug">{task.title}</div>
      <div className="flex items-center gap-2">
        {task.priority !== "none" && <PriorityBadge priority={task.priority} />}
        {task.due_date && (
          <span className="text-xs opacity-50">{formatDate(task.due_date)}</span>
        )}
        <div className="ml-auto">
          {task.assignee && <Avatar profile={task.assignee} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------
function ListView({
  statuses,
  tasksFor,
  onOpen,
}: {
  statuses: ProjectStatus[];
  tasksFor: (statusId: string) => Task[];
  onOpen: (t: Task) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl p-4">
      {statuses.map((s) => {
        const list = tasksFor(s.id);
        return (
          <div key={s.id} className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-sm font-medium">{s.name}</span>
              <span className="text-xs opacity-40">{list.length}</span>
            </div>
            <div className="overflow-hidden rounded-lg border">
              {list.length === 0 && (
                <div className="px-3 py-2 text-sm opacity-40">No tasks</div>
              )}
              {list.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onOpen(t)}
                  className="flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-black/5 dark:hover:bg-white/5"
                >
                  {t.priority !== "none" && <PriorityBadge priority={t.priority} />}
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.due_date && (
                    <span className="text-xs opacity-50">
                      {formatDate(t.due_date)}
                    </span>
                  )}
                  {t.assignee && <Avatar profile={t.assignee} />}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table view
// ---------------------------------------------------------------------------
function TableView({
  tasks,
  statuses,
  onOpen,
}: {
  tasks: Task[];
  statuses: ProjectStatus[];
  onOpen: (t: Task) => void;
}) {
  const statusName = (id: string | null) =>
    statuses.find((s) => s.id === id)?.name ?? "—";

  return (
    <div className="p-4">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide opacity-50">
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Assignee</th>
            <th className="px-3 py-2 font-medium">Due</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr
              key={t.id}
              onClick={() => onOpen(t)}
              className="cursor-pointer border-b hover:bg-black/5 dark:hover:bg-white/5"
            >
              <td className="px-3 py-2">{t.title}</td>
              <td className="px-3 py-2 opacity-70">{statusName(t.status_id)}</td>
              <td className="px-3 py-2">
                {t.priority !== "none" ? (
                  <PriorityBadge priority={t.priority} />
                ) : (
                  <span className="opacity-30">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                {t.assignee ? (
                  <div className="flex items-center gap-2">
                    <Avatar profile={t.assignee} />
                    <span className="opacity-70">
                      {t.assignee.full_name || t.assignee.email}
                    </span>
                  </div>
                ) : (
                  <span className="opacity-30">Unassigned</span>
                )}
              </td>
              <td className="px-3 py-2 opacity-70">
                {t.due_date ? formatDate(t.due_date) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const meta = PRIORITY_META[priority];
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{ background: `${meta.color}22`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

function Avatar({ profile }: { profile: Profile }) {
  const initial = (profile.full_name || profile.email || "?")
    .charAt(0)
    .toUpperCase();
  return (
    <div
      title={profile.full_name || profile.email || ""}
      className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-indigo-500 text-[11px] font-medium text-white"
    >
      {initial}
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
