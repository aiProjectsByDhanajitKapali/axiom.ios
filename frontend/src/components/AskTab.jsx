import { useRef, useEffect, useState } from "react";
import MarkdownAnswer from "./MarkdownAnswer";
import { formatDuration } from "../utils/formatDuration";

const SUGGESTIONS = [
  "What's in my knowledge base?",
  "Summarize my SwiftUI notes",
  "What did I learn about iOS architecture?",
];

export default function AskTab() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingElapsedMs, setLoadingElapsedMs] = useState(0);
  const scrollRef = useRef(null);
  const loadingStartedRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) {
      setLoadingElapsedMs(0);
      loadingStartedRef.current = null;
      return;
    }
    loadingStartedRef.current = performance.now();
    const id = setInterval(() => {
      if (loadingStartedRef.current != null) {
        setLoadingElapsedMs(Math.round(performance.now() - loadingStartedRef.current));
      }
    }, 100);
    return () => clearInterval(id);
  }, [loading]);

  function patchLastAssistant(patch) {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant" && last.streaming) {
        next[next.length - 1] = typeof patch === "function" ? patch(last) : { ...last, ...patch };
      }
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);
    const startedAt = performance.now();

    try {
      const res = await fetch("/api/ask/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Request failed");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", sources: [], streaming: true },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let streamError = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const evt = JSON.parse(line);
          if (evt.type === "sources") {
            patchLastAssistant({ sources: evt.sources });
          } else if (evt.type === "delta") {
            patchLastAssistant((last) => ({ ...last, content: last.content + evt.text }));
          } else if (evt.type === "error") {
            streamError = evt.detail;
          }
        }
      }
      if (streamError) throw new Error(streamError);

      patchLastAssistant({
        streaming: false,
        responseMs: Math.round(performance.now() - startedAt),
      });
    } catch (err) {
      const responseMs = Math.round(performance.now() - startedAt);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        const errLine = `Error: ${err.message}`;
        if (last?.role === "assistant" && last.streaming) {
          next[next.length - 1] = {
            ...last,
            streaming: false,
            error: true,
            responseMs,
            content: last.content ? `${last.content}\n\n${errLine}` : errLine,
          };
        } else {
          next.push({ role: "assistant", content: errLine, sources: [], responseMs, error: true });
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  const lastMsg = messages[messages.length - 1];
  const showThinking =
    loading && !(lastMsg?.role === "assistant" && lastMsg.streaming && lastMsg.content);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-axiom-accent to-axiom-accent2 text-xl font-bold text-axiom-bg shadow-xl shadow-axiom-accent/25">
              A
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-100">
                Ask your knowledge base
              </h2>
              <p className="mt-1 text-sm text-axiom-muted">
                Answers are grounded in your indexed notes, with cited sources.
              </p>
            </div>
            <div className="flex max-w-md flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInput(s)}
                  className="rounded-full border border-axiom-border bg-axiom-panel px-3.5 py-1.5 text-xs text-axiom-muted transition hover:border-axiom-accent/50 hover:text-gray-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <div key={i} className="flex justify-end animate-message-in">
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-axiom-accent/20 bg-axiom-accent/15 px-4 py-2.5 text-sm text-gray-100">
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-3 animate-message-in">
                  <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-axiom-accent to-axiom-accent2 text-[11px] font-bold text-axiom-bg shadow-lg shadow-axiom-accent/20">
                    A
                  </div>
                  <div
                    className={`min-w-0 flex-1 rounded-2xl rounded-tl-md border bg-axiom-panel px-4 py-3 ${
                      msg.error ? "border-rose-500/40" : "border-axiom-border"
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-axiom-muted">
                        Axiom
                      </span>
                      {msg.responseMs != null && (
                        <span
                          className="font-mono text-[11px] tabular-nums text-axiom-muted"
                          title="Query to answer"
                        >
                          {formatDuration(msg.responseMs)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm">
                      <MarkdownAnswer content={msg.content} />
                      {msg.streaming && msg.content && <span className="streaming-cursor" />}
                    </div>
                    {msg.sources?.length > 0 && !msg.streaming && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {msg.sources.map((s, j) => (
                          <span
                            key={j}
                            className="inline-flex items-center gap-1 rounded-full border border-axiom-border bg-axiom-bg/60 px-2.5 py-0.5 font-mono text-[11px] text-axiom-accent"
                            title={`${s.label} — distance: ${s.distance}`}
                          >
                            {s.path.split("/").pop()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
            {showThinking && (
              <div className="flex gap-3 animate-message-in">
                <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-axiom-accent to-axiom-accent2 text-[11px] font-bold text-axiom-bg opacity-70">
                  A
                </div>
                <div className="flex items-center gap-3 rounded-2xl rounded-tl-md border border-axiom-border bg-axiom-panel px-4 py-3">
                  <span className="flex items-center gap-1">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-axiom-muted">
                    {formatDuration(loadingElapsedMs)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 border-t border-white/5 bg-axiom-bg/80 p-4 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-axiom-border bg-axiom-panel px-2 py-1.5 transition focus-within:border-axiom-accent/60 focus-within:ring-1 focus-within:ring-axiom-accent/40">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your iOS knowledge base…"
            disabled={loading}
            className="flex-1 bg-transparent px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-axiom-muted disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-axiom-accent text-axiom-bg shadow-md shadow-axiom-accent/25 transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
