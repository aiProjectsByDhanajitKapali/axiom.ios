import { useOllamaStatus } from "../context/OllamaStatusContext";

function StatusPill({ label, state, detail }) {
  // state: "ready" | "down" | "loading"
  const dot =
    state === "loading"
      ? "bg-axiom-muted animate-pulse"
      : state === "ready"
        ? "bg-axiom-green shadow-[0_0_8px_rgba(52,211,153,0.7)]"
        : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]";

  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-axiom-border bg-axiom-panel/80 px-2.5 py-1 text-[11px] text-axiom-muted"
      title={detail}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} aria-hidden />
      <span className={state === "ready" ? "text-gray-300" : ""}>{label}</span>
    </div>
  );
}

export default function HeaderStatus() {
  const { status } = useOllamaStatus();
  const { loading, ollama, models } = status;

  const toState = (ready) => (loading ? "loading" : ready ? "ready" : "down");

  const ollamaDetail = ollama.ready
    ? `Ollama reachable at ${ollama.host}`
    : ollama.error
      ? `Ollama offline: ${ollama.error}`
      : "Waiting for Ollama…";

  const llm = models.llm;
  const embed = models.embed;
  const bothLoaded = llm.loaded && embed.loaded;
  const modelsDetail = models.ready
    ? bothLoaded
      ? `${llm.name} and ${embed.name} loaded in memory`
      : `${llm.name} and ${embed.name} installed — load on first use`
    : !ollama.ready
      ? "Requires Ollama"
      : `Missing: ${[!llm.installed && llm.name, !embed.installed && embed.name].filter(Boolean).join(", ")}`;

  return (
    <div className="flex items-center gap-2 mr-2">
      <StatusPill label="Ollama" state={toState(ollama.ready)} detail={ollamaDetail} />
      <StatusPill label="Models" state={toState(models.ready)} detail={modelsDetail} />
    </div>
  );
}
