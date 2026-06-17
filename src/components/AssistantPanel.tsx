"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

const SUGGESTIONS = [
  "Summarize what's on this board",
  "Add a task: review the Q3 roadmap (high priority)",
  "What's still in 'To do'?",
];

export function AssistantPanel({
  workspaceId,
  projectId,
  onClose,
}: {
  workspaceId: string;
  projectId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const history = [...messages, { role: "user" as const, content: trimmed }];
    setMessages([...history, { role: "assistant", content: "", tools: [] }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          projectId,
          workspaceId,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        appendToAssistant(`⚠️ ${err.error ?? "Request failed"}`);
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.type === "text") appendToAssistant(evt.text);
          else if (evt.type === "tool") addTool(evt.name);
          else if (evt.type === "error") appendToAssistant(`\n⚠️ ${evt.message}`);
        }
      }

      // Tools may have changed the board — pull fresh server data.
      router.refresh();
    } catch (err) {
      appendToAssistant(
        `\n⚠️ ${err instanceof Error ? err.message : "Connection error"}`,
      );
    } finally {
      setBusy(false);
    }
  }

  function appendToAssistant(text: string) {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === "assistant") {
        next[next.length - 1] = { ...last, content: last.content + text };
      }
      return next;
    });
  }

  function addTool(name: string) {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === "assistant") {
        next[next.length - 1] = {
          ...last,
          tools: [...(last.tools ?? []), name],
        };
      }
      return next;
    });
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l bg-background shadow-2xl">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span>✨</span>
          <span className="text-sm font-semibold">TeamSpace Assistant</span>
        </div>
        <button
          onClick={onClose}
          className="rounded px-2 text-lg leading-none opacity-50 hover:opacity-100"
        >
          ×
        </button>
      </header>

      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm opacity-60">
              Ask me to manage your board. I can create tasks, summarize work,
              and move things along.
            </p>
            {!projectId && (
              <p className="rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                Open a project for task actions to take effect.
              </p>
            )}
            <div className="space-y-1.5 pt-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="block w-full rounded-lg border px-3 py-2 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div key={i}>
                <div
                  className={`text-xs font-medium opacity-40 ${
                    m.role === "user" ? "text-right" : ""
                  }`}
                >
                  {m.role === "user" ? "You" : "Assistant"}
                </div>
                {m.tools && m.tools.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.tools.map((t, j) => (
                      <span
                        key={j}
                        className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                      >
                        ⚙ {t}
                      </span>
                    ))}
                  </div>
                )}
                <div
                  className={`mt-1 whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "ml-8 bg-indigo-600 text-white"
                      : "mr-4 bg-black/5 dark:bg-white/5"
                  }`}
                >
                  {m.content || (busy && i === messages.length - 1 ? "…" : "")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Message the assistant…"
            className="max-h-32 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
