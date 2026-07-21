import { useVoiceSession } from "../hooks/useVoiceSession";
import VoiceLevelGraph from "./VoiceLevelGraph";
import { formatDuration } from "../utils/formatDuration";

const PHASE_LABEL = {
  idle: "Ready",
  starting: "Starting…",
  listening: "Listening…",
  processing: "Thinking…",
  speaking: "Speaking…",
};

export default function VoiceTab() {
  const {
    phase,
    transcript,
    lastAnswer,
    lastResponseMs,
    error,
    voiceReady,
    audioLevels,
    isSilent,
    silenceProgress,
    noiseThreshold,
    startSession,
    stopSession,
    checkVoiceStatus,
  } = useVoiceSession();

  const isActive = phase !== "idle";
  const isStarting = phase === "starting";

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <div className="w-full max-w-lg text-center space-y-8">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">Voice chat</h2>
          <p className="mt-2 text-sm text-axiom-muted">
            Fully local English voice — Whisper listens, Piper speaks. Answers
            use your indexed knowledge base.
          </p>
        </div>

        <div
          className={`relative mx-auto w-40 h-40 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
            phase === "listening"
              ? "border-axiom-accent shadow-[0_0_32px_rgba(88,166,255,0.35)] animate-pulse"
              : phase === "speaking"
                ? "border-emerald-500/80 shadow-[0_0_24px_rgba(52,211,153,0.25)]"
                : phase === "processing" || phase === "starting"
                  ? "border-amber-500/60 animate-pulse"
                  : "border-axiom-border"
          }`}
        >
          <span className="text-5xl" aria-hidden>
            {phase === "listening"
              ? "🎤"
              : phase === "speaking"
                ? "🔊"
                : phase === "processing"
                  ? "💭"
                  : "○"}
          </span>
        </div>

        <p className="font-mono text-sm text-axiom-accent tracking-wide uppercase">
          {PHASE_LABEL[phase] || phase}
        </p>

        <VoiceLevelGraph
          levels={audioLevels}
          active={phase === "listening"}
          isSilent={phase === "listening" && isSilent}
          silenceProgress={phase === "listening" ? silenceProgress : 0}
          threshold={phase === "listening" ? noiseThreshold : null}
        />

        {voiceReady === false && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90 text-left">
            <p className="font-medium">Voice models not ready</p>
            <p className="mt-1 text-axiom-muted">
              From the project root run:{" "}
              <code className="text-axiom-accent">
                ./scripts/download_voice_models.sh
              </code>
            </p>
            <button
              type="button"
              onClick={checkVoiceStatus}
              className="mt-3 text-xs text-axiom-accent hover:underline"
            >
              Check again
            </button>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400/90 font-mono">{error}</p>
        )}

        <div className="flex gap-3 justify-center">
          {!isActive ? (
            <button
              type="button"
              onClick={startSession}
              disabled={voiceReady === false || isStarting}
              className="rounded-lg bg-axiom-accent px-8 py-3 text-sm font-medium text-axiom-bg hover:opacity-90 disabled:opacity-40 transition"
            >
              {isStarting ? "Starting…" : "Start voice session"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopSession}
              className="rounded-lg border border-red-500/50 px-8 py-3 text-sm font-medium text-red-300 hover:bg-red-500/10 transition"
            >
              Stop
            </button>
          )}
        </div>

        {(transcript || lastAnswer) && (
          <div className="rounded-lg border border-axiom-border bg-axiom-panel/60 p-4 text-left text-sm space-y-3 font-mono">
            {transcript && (
              <div>
                <p className="text-xs text-axiom-muted uppercase mb-1">You said</p>
                <p className="text-gray-200">{transcript}</p>
              </div>
            )}
            {lastAnswer && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs text-axiom-muted uppercase">
                    Last answer (spoken)
                  </p>
                  {lastResponseMs != null && (
                    <span
                      className="text-xs text-axiom-muted tabular-nums"
                      title="Query to answer"
                    >
                      {formatDuration(lastResponseMs)}
                    </span>
                  )}
                </div>
                <p className="text-gray-300 text-xs leading-relaxed line-clamp-4">
                  {lastAnswer}
                </p>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-axiom-muted">
          Watch the graph: bars rise while you talk and drop below the dotted
          threshold when you pause — hold that pause ~1.5s to send. The
          threshold adapts to steady background noise like fans. Requires
          microphone access.
        </p>
      </div>
    </div>
  );
}
