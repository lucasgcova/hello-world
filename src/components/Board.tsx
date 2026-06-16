"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import {
  PRIORITY_META,
  type Label,
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
type SortKey = "manual" | "priority" | "due" | "created";

interface Filters {
  search: string;
  assigneeId: string; // "" = all, "__none__" = unassigned
  priority: string; // "" = all
  labelId: string; // "" = all
}

const EMPTY_FILTERS: Filters = {
  search: "",
  assigneeId: "",
  priority: "",
  labelId: "",
};

export function Board({
  project,
  statuses,
  tasks: initialTasks,
  members,
  labels,
}: {
  project: Project;
  statuses: ProjectStatus[];
  tasks: Task[];
  members: WorkspaceMember[];
  labels: Label[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [view, setView] = useState<View>("board");
  const [selected, setSelected] = useState<Task | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>("manual");

  const assignees = useMemo(
    () => members.map((m) => m.profile).filter(Boolean) as Profile[],
    [members],
  );

  // Re-sync local state whenever the server data meaningfully changes
  // (e.g. after a realtime-triggered refresh).
  const initialKey = useMemo(
    () =>
      initialTasks
        .map(
          (t) =>
            `${t.id}:${t.updated_at}:${t.position}:${t.status_id}:${(t.labels ?? [])
              .map((l) => l.id)
              .join("+")}`,
        )
        .join("|"),
    [initialTasks],
  );
  useEffect(() => {
    setTasks(initialTasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  // Live updates from teammates.
  useRealtimeRefresh(project.id, () => router.refresh());

  const firstStatusId = statuses[0]?.id ?? null;
  const filtersActive =
    filters.search !== "" ||
    filters.assigneeId !== "" ||
    filters.priority !== "" ||
    filters.labelId !== "";

  const visible = useMemo(() => {
    const match = (t: Task) => {
      if (
        filters.search &&
        !t.title.toLowerCase().includes(filters.search.toLowerCase())
      )
        return false;
      if (filters.assigneeId === "__none__" && t.assignee_id) return false;
      if (
        filters.assigneeId &&
        filters.assigneeId !== "__none__" &&
        t.assignee_id !== filters.assigneeId
      )
        return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (
        filters.labelId &&
        !(t.labels ?? []).some((l) => l.id === filters.labelId)
      )
        return false;
      return true;
    };

    const sorted = tasks.filter(match);
    sorted.sort((a, b) => {
      switch (sort) {
        case "priority":
          return PRIORITY_META[b.priority].rank - PRIORITY_META[a.priority].rank;
        case "due":
          return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
        case "created":
          return b.created_at.localeCompare(a.created_at);
        default:
          return a.position - b.position;
      }
    });
    return sorted;
  }, [tasks, filters, sort]);

  function tasksFor(statusId: string) {
    return visible.filter(
      (t) =>
        t.status_id === statusId ||
        (t.status_id === null && statusId === firstStatusId),
    );
  }

  function nextPosFor(statusId: string) {
    const inCol = tasks.filter(
      (t) =>
        t.status_id === statusId ||
        (t.status_id === null && statusId === firstStatusId),
    );
    return (
      Math.max(0, ...inCol.map((t) => t.position)) + 1000
    );
  }

  function patchLocal(id: string, patch: Partial<Task>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function handleDrop(statusId: string) {
    if (!dragId) return;
    const id = dragId;
    setDragId(null);
    const nextPos = nextPosFor(statusId);
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
      position: nextPosFor(statusId),
      created_by: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      labels: [],
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
    router.refresh();
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

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-2 text-sm">
        <input
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          placeholder="Search tasks…"
          className="w-40 rounded-md border bg-background px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
        <Select
          value={filters.assigneeId}
          onChange={(v) => setFilters({ ...filters, assigneeId: v })}
        >
          <option value="">Anyone</option>
          <option value="__none__">Unassigned</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.full_name || a.email}
            </option>
          ))}
        </Select>
        <Select
          value={filters.priority}
          onChange={(v) => setFilters({ ...filters, priority: v })}
        >
          <option value="">Any priority</option>
          {(["urgent", "high", "medium", "low", "none"] as TaskPriority[]).map(
            (p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ),
          )}
        </Select>
        {labels.length > 0 && (
          <Select
            value={filters.labelId}
            onChange={(v) => setFilters({ ...filters, labelId: v })}
          >
            <option value="">Any label</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
        <div className="ml-auto flex items-center gap-2">
          {filtersActive && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="text-xs opacity-60 hover:opacity-100"
            >
              Clear
            </button>
          )}
          <span className="text-xs opacity-40">Sort</span>
          <Select value={sort} onChange={(v) => setSort(v as SortKey)}>
            <option value="manual">Manual</option>
            <option value="priority">Priority</option>
            <option value="due">Due date</option>
            <option value="created">Newest</option>
          </Select>
        </div>
      </div>

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
          <ListView statuses={statuses} tasksFor={tasksFor} onOpen={setSelected} />
        )}
        {view === "table" && (
          <TableView tasks={visible} statuses={statuses} onOpen={setSelected} />
        )}
      </div>

      {selected && (
        <TaskDialog
          task={selected}
          statuses={statuses}
          assignees={assignees}
          labels={labels}
          projectId={project.id}
          workspaceId={project.workspace_id}
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
      {task.labels && task.labels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      )}
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
                  {(t.labels ?? []).slice(0, 2).map((l) => (
                    <LabelChip key={l.id} label={l} />
                  ))}
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
function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border bg-background px-2 py-1 text-sm outline-none"
    >
      {children}
    </select>
  );
}

function LabelChip({ label }: { label: Label }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{ background: `${label.color}22`, color: label.color }}
    >
      {label.name}
    </span>
  );
}

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
