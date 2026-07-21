import { useCallback, useEffect, useState } from "react";

const URL_RE = /^https?:\/\/\S+$/i;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TrainTab() {
  const [files, setFiles] = useState([]);
  const [filesError, setFilesError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState(null);

  const isUrl = URL_RE.test(input.trim());

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/train/files");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not list files");
      setFiles(data.files || []);
      setFilesError(null);
      return data.files || [];
    } catch (err) {
      setFilesError(err.message);
      return [];
    }
  }, []);

  const selectFile = useCallback(async (name) => {
    setSelected(name);
    setPreview(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/train/files/${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not load file");
      setPreview(data);
    } catch (err) {
      setPreview({ name, content: `Error: ${err.message}`, truncated: false });
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  async function handleCommit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setLoading(true);
    setBanner(null);

    try {
      const res = await fetch(isUrl ? "/api/train/url" : "/api/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isUrl ? { url: text } : { content: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Training failed");
      setBanner({ type: "success", text: `${data.message} (${data.filename})` });
      setInput("");
      await loadFiles();
      selectFile(data.filename);
    } catch (err) {
      setBanner({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] p-4 gap-3 max-w-6xl mx-auto w-full">
      {banner && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-sm shrink-0 ${
            banner.type === "success"
              ? "border-axiom-green/50 bg-axiom-green/10 text-axiom-green"
              : "border-red-500/50 bg-red-500/10 text-red-400"
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-3 min-h-0">
        {/* file list */}
        <section className="flex flex-col min-h-0 rounded-2xl border border-axiom-border bg-axiom-panel/60">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-axiom-border/60">
            <h3 className="text-xs font-medium uppercase tracking-wider text-axiom-muted">
              Knowledge files
            </h3>
            <button
              type="button"
              onClick={loadFiles}
              title="Refresh list"
              aria-label="Refresh file list"
              className="text-axiom-muted hover:text-gray-200 transition text-sm leading-none"
            >
              ⟳
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
            {filesError ? (
              <p className="px-2 py-3 text-xs text-red-400">{filesError}</p>
            ) : files.length === 0 ? (
              <p className="px-2 py-3 text-xs text-axiom-muted">
                No files yet — add notes or a URL below.
              </p>
            ) : (
              files.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => selectFile(f.name)}
                  className={`w-full rounded-lg px-3 py-2 text-left transition border ${
                    selected === f.name
                      ? "border-axiom-accent/50 bg-axiom-accent/10"
                      : "border-transparent hover:bg-axiom-raised/80"
                  }`}
                >
                  <p
                    className={`truncate font-mono text-xs ${
                      selected === f.name ? "text-axiom-accent" : "text-gray-200"
                    }`}
                  >
                    {f.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-axiom-muted">
                    {formatSize(f.size)} · {formatDate(f.modified)}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>

        {/* preview */}
        <section className="flex flex-col min-h-0 rounded-2xl border border-axiom-border bg-axiom-panel/60">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-axiom-border/60">
            <h3 className="text-xs font-medium uppercase tracking-wider text-axiom-muted truncate">
              {selected ? selected : "Preview"}
            </h3>
            {preview?.truncated && (
              <span className="shrink-0 text-[11px] text-axiom-amber">
                preview truncated
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
            {previewLoading ? (
              <p className="text-xs text-axiom-muted animate-pulse">Loading…</p>
            ) : preview ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-300">
                {preview.content}
              </pre>
            ) : (
              <p className="text-xs text-axiom-muted">
                Select a file on the left to preview its contents.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* composer */}
      <form onSubmit={handleCommit} className="shrink-0">
        <div className="flex items-end gap-2 rounded-2xl border border-axiom-border bg-axiom-panel px-2 py-2 transition focus-within:border-axiom-accent/60 focus-within:ring-1 focus-within:ring-axiom-accent/40">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste notes to save, or a page URL (https://…) to scrape and index…"
            disabled={loading}
            rows={2}
            className="flex-1 resize-none bg-transparent px-3 py-1.5 font-mono text-sm text-gray-100 outline-none placeholder:text-axiom-muted disabled:opacity-50 scrollbar-thin"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-axiom-bg transition hover:opacity-90 disabled:opacity-40 flex items-center gap-2 ${
              isUrl ? "bg-axiom-accent shadow-md shadow-axiom-accent/20" : "bg-axiom-green shadow-md shadow-axiom-green/20"
            }`}
          >
            {loading && (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-axiom-bg border-t-transparent" />
            )}
            {isUrl ? "Scrape & Index" : "Commit"}
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-axiom-muted">
          {isUrl
            ? "URL detected — the page text will be extracted, saved to data/notes/, and embedded so Ask and Voice can use it."
            : "Text is saved to data/notes/ and embedded into ChromaDB immediately."}
        </p>
      </form>
    </div>
  );
}
