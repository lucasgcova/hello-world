"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updatePage, createPage, deletePage } from "@/lib/actions/pages";
import type { Block, BlockType, Page } from "@/lib/types";

const uid = () => crypto.randomUUID();

const EMOJIS = [
  "📄", "📝", "📚", "📌", "💡", "🎯", "🚀", "🧠", "📊", "🗒️",
  "✅", "🔧", "🎨", "🔬", "📦", "🌐", "🏗️", "🧭", "📣", "🧩",
];

const SLASH_OPTIONS: { type: BlockType; label: string; hint: string }[] = [
  { type: "paragraph", label: "Text", hint: "Plain paragraph" },
  { type: "h1", label: "Heading 1", hint: "Large heading" },
  { type: "h2", label: "Heading 2", hint: "Medium heading" },
  { type: "h3", label: "Heading 3", hint: "Small heading" },
  { type: "bullet", label: "Bulleted list", hint: "• item" },
  { type: "todo", label: "To-do", hint: "Checklist item" },
  { type: "quote", label: "Quote", hint: "Callout / quote" },
  { type: "code", label: "Code", hint: "Monospace block" },
  { type: "divider", label: "Divider", hint: "Horizontal rule" },
];

function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function PageEditor({
  page,
  childPages,
  workspaceId,
}: {
  page: Page;
  childPages: Page[];
  workspaceId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [showIcons, setShowIcons] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>(() =>
    page.content.length > 0
      ? page.content
      : [{ id: uid(), type: "paragraph", text: "" }],
  );

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const inputs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const focusCaret = useRef<number | null>(null);
  const firstRender = useRef(true);

  // Debounced autosave.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      updatePage({ id: page.id, title, icon, content: blocks });
    }, 600);
    return () => clearTimeout(t);
  }, [title, icon, blocks, page.id]);

  // Focus management after structural changes.
  useEffect(() => {
    if (focusId && inputs.current[focusId]) {
      const el = inputs.current[focusId]!;
      el.focus();
      const pos = focusCaret.current ?? el.value.length;
      el.setSelectionRange(pos, pos);
      focusCaret.current = null;
      setFocusId(null);
    }
  }, [focusId, blocks]);

  function queueFocus(id: string, caret: number | null = null) {
    focusCaret.current = caret;
    setFocusId(id);
  }

  function setText(id: string, text: string) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, text } : b)));
  }

  function toggleCheck(id: string) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, checked: !b.checked } : b)),
    );
  }

  function convert(id: string, type: BlockType) {
    const newParaId = type === "divider" ? uid() : null;
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        type,
        text: "",
        checked: type === "todo" ? false : undefined,
      };
      if (type === "divider" && newParaId) {
        next.splice(idx + 1, 0, { id: newParaId, type: "paragraph", text: "" });
      }
      return next;
    });
    queueFocus(type === "divider" ? newParaId! : id);
  }

  function onEnter(id: string) {
    const cur = blocksRef.current.find((b) => b.id === id);
    if (!cur) return;
    // Exit an empty list/todo by turning it back into a paragraph.
    if ((cur.type === "bullet" || cur.type === "todo") && cur.text === "") {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, type: "paragraph", checked: undefined } : b,
        ),
      );
      queueFocus(id);
      return;
    }
    const type: BlockType =
      cur.type === "bullet" || cur.type === "todo" ? cur.type : "paragraph";
    const newId = uid();
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, {
        id: newId,
        type,
        text: "",
        checked: type === "todo" ? false : undefined,
      });
      return next;
    });
    queueFocus(newId);
  }

  function onBackspaceStart(id: string): boolean {
    const list = blocksRef.current;
    const idx = list.findIndex((b) => b.id === id);
    const cur = list[idx];
    if (!cur) return false;

    // Non-paragraph → outdent to paragraph first.
    if (cur.type !== "paragraph") {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, type: "paragraph", checked: undefined } : b,
        ),
      );
      queueFocus(id, 0);
      return true;
    }

    if (idx === 0) return false;
    const prevBlock = list[idx - 1];

    if (prevBlock.type === "divider") {
      setBlocks((prev) => prev.filter((b) => b.id !== prevBlock.id));
      queueFocus(id, 0);
      return true;
    }

    // Merge into previous text block.
    const caret = prevBlock.text.length;
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const next = [...prev];
      next[i - 1] = { ...next[i - 1], text: next[i - 1].text + cur.text };
      next.splice(i, 1);
      return next;
    });
    queueFocus(prevBlock.id, caret);
    return true;
  }

  async function addSubPage() {
    const res = await createPage({ workspaceId, parentId: page.id });
    if (res.id) {
      router.push(`/pages/${res.id}`);
      router.refresh();
    }
  }

  async function onDelete() {
    if (!confirm("Delete this page? This cannot be undone.")) return;
    await deletePage({ id: page.id });
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-10">
        {/* Header */}
        <div className="relative mb-2">
          <button
            onClick={() => setShowIcons((s) => !s)}
            className="mb-2 rounded-lg px-1 text-5xl transition hover:bg-black/5 dark:hover:bg-white/5"
          >
            {icon}
          </button>
          {showIcons && (
            <div className="absolute z-10 mb-2 flex max-w-xs flex-wrap gap-1 rounded-xl border bg-background p-2 shadow-lg">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    setIcon(e);
                    setShowIcons(false);
                  }}
                  className="rounded-md px-1.5 py-1 text-xl transition hover:bg-black/5 dark:hover:bg-white/5"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          className="mb-4 w-full bg-transparent text-4xl font-bold outline-none placeholder:opacity-30"
        />

        {/* Blocks */}
        <div className="space-y-0.5">
          {blocks.map((b) => (
            <BlockRow
              key={b.id}
              block={b}
              registerRef={(el) => {
                inputs.current[b.id] = el;
                autosize(el);
              }}
              onChangeText={(text) => setText(b.id, text)}
              onToggleCheck={() => toggleCheck(b.id)}
              onEnter={() => onEnter(b.id)}
              onBackspaceStart={() => onBackspaceStart(b.id)}
              onConvert={(type) => convert(b.id, type)}
              onRemove={() => {
                setBlocks((prev) =>
                  prev.length > 1 ? prev.filter((x) => x.id !== b.id) : prev,
                );
              }}
            />
          ))}
        </div>

        {/* Sub-pages */}
        <div className="mt-10 border-t pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide opacity-40">
              Sub-pages
            </span>
            <button
              onClick={addSubPage}
              className="text-sm opacity-60 transition hover:opacity-100"
            >
              + Add sub-page
            </button>
          </div>
          {childPages.length === 0 ? (
            <p className="text-sm opacity-40">No sub-pages yet.</p>
          ) : (
            <div className="space-y-1">
              {childPages.map((c) => (
                <Link
                  key={c.id}
                  href={`/pages/${c.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span>{c.icon}</span>
                  <span>{c.title}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8">
          <button
            onClick={onDelete}
            className="text-sm text-red-500 hover:text-red-600"
          >
            Delete page
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block row
// ---------------------------------------------------------------------------
function BlockRow({
  block,
  registerRef,
  onChangeText,
  onToggleCheck,
  onEnter,
  onBackspaceStart,
  onConvert,
  onRemove,
}: {
  block: Block;
  registerRef: (el: HTMLTextAreaElement | null) => void;
  onChangeText: (text: string) => void;
  onToggleCheck: () => void;
  onEnter: () => void;
  onBackspaceStart: () => boolean;
  onConvert: (type: BlockType) => void;
  onRemove: () => void;
}) {
  const showMenu = block.type !== "divider" && block.text.startsWith("/");
  const query = showMenu ? block.text.slice(1).toLowerCase() : "";
  const options = SLASH_OPTIONS.filter((o) =>
    o.label.toLowerCase().includes(query),
  );

  if (block.type === "divider") {
    return (
      <div className="group relative py-2">
        <hr className="border-t" />
        <button
          onClick={onRemove}
          className="absolute right-0 top-1 hidden text-xs text-red-500 group-hover:block"
        >
          remove
        </button>
      </div>
    );
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showMenu && e.key === "Enter") {
      e.preventDefault();
      if (options[0]) onConvert(options[0].type);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && block.type !== "code") {
      e.preventDefault();
      onEnter();
    } else if (e.key === "Backspace") {
      const ta = e.currentTarget;
      if (ta.selectionStart === 0 && ta.selectionEnd === 0) {
        if (onBackspaceStart()) e.preventDefault();
      }
    }
  }

  const textarea = (
    <textarea
      ref={registerRef}
      value={block.text}
      rows={1}
      onChange={(e) => {
        onChangeText(e.target.value);
        autosize(e.currentTarget);
      }}
      onKeyDown={handleKey}
      placeholder={placeholderFor(block.type)}
      className={`w-full resize-none overflow-hidden bg-transparent outline-none placeholder:opacity-25 ${classFor(
        block.type,
      )} ${block.type === "todo" && block.checked ? "line-through opacity-50" : ""}`}
    />
  );

  return (
    <div className="relative">
      <div className="flex items-start gap-2">
        {block.type === "bullet" && (
          <span className="select-none pt-[2px] leading-7 opacity-60">•</span>
        )}
        {block.type === "todo" && (
          <input
            type="checkbox"
            checked={block.checked ?? false}
            onChange={onToggleCheck}
            className="mt-[7px] h-4 w-4 shrink-0"
          />
        )}
        <div
          className={
            block.type === "quote"
              ? "flex-1 border-l-2 border-indigo-400 pl-3"
              : block.type === "code"
                ? "flex-1 rounded-lg bg-black/5 px-3 py-2 dark:bg-white/5"
                : "flex-1"
          }
        >
          {textarea}
        </div>
      </div>

      {showMenu && options.length > 0 && (
        <div className="absolute z-20 mt-1 w-56 rounded-xl border bg-background p-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o.type}
              onMouseDown={(e) => {
                e.preventDefault();
                onConvert(o.type);
              }}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
            >
              <span>{o.label}</span>
              <span className="text-xs opacity-40">{o.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function classFor(type: BlockType): string {
  switch (type) {
    case "h1":
      return "text-3xl font-bold leading-tight py-1";
    case "h2":
      return "text-2xl font-semibold leading-tight py-1";
    case "h3":
      return "text-xl font-semibold leading-snug py-0.5";
    case "quote":
      return "italic leading-7";
    case "code":
      return "font-mono text-sm leading-6";
    default:
      return "leading-7";
  }
}

function placeholderFor(type: BlockType): string {
  switch (type) {
    case "h1":
      return "Heading 1";
    case "h2":
      return "Heading 2";
    case "h3":
      return "Heading 3";
    case "bullet":
      return "List item";
    case "todo":
      return "To-do";
    case "quote":
      return "Quote";
    case "code":
      return "Code";
    default:
      return "Type '/' for commands…";
  }
}
