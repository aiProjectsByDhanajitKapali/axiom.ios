import { useEffect } from "react";
import { useFridaySession } from "../../hooks/useFridaySession";
import SciFiMatrix from "./SciFiMatrix";
import VoiceAura from "./VoiceAura";

const PHASE_STATUS = {
  idle: "STANDBY",
  starting: "INITIALIZING",
  listening: "AUDIO IN",
  processing: "PROCESSING",
  speaking: "OUTPUT",
  mic_paused: "MIC OFF",
};

function MicIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor" aria-hidden>
      {active ? (
        <>
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
          <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.08A7 7 0 0 0 19 11Z" />
        </>
      ) : (
        <>
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" opacity="0.35" />
          <path d="M3 3 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export default function FridayMode({ onClose }) {
  const {
    phase,
    micEnabled,
    transcript,
    lastAnswer,
    greeting,
    error,
    voiceReady,
    audioLevels,
    startSession,
    stopSession,
    toggleMic,
  } = useFridaySession();

  useEffect(() => {
    startSession();
    return () => stopSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayPhase = PHASE_STATUS[phase] || phase.toUpperCase();
  const micActive = micEnabled && phase === "listening";

  return (
    <div className="friday-shell fixed inset-0 z-50 flex flex-col overflow-hidden">
      <div className="friday-grid-bg absolute inset-0" aria-hidden />

      <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-cyan-500/20">
        <div>
          <p className="friday-label text-[10px] tracking-[0.35em] text-cyan-400/70 uppercase">
            Stark Industries
          </p>
          <h1 className="friday-title text-2xl font-light tracking-[0.2em] text-cyan-100">
            F.R.I.D.A.Y.
          </h1>
        </div>
        <div className="text-right font-mono text-xs">
          <p className="text-cyan-500/60 uppercase tracking-widest">System</p>
          <p
            className={`tracking-wider ${
              phase === "processing" || phase === "starting"
                ? "text-blue-400 friday-status-pulse"
                : phase === "listening"
                  ? "text-emerald-300"
                  : "text-cyan-200/80"
            }`}
          >
            {displayPhase}
          </p>
        </div>
      </header>

      <main className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-[1fr_minmax(280px,360px)_1fr] gap-4 px-6 py-6 min-h-0">
        <section className="friday-panel flex flex-col min-h-0 order-2 lg:order-1">
          <div className="friday-panel-header">
            <span className="friday-panel-dot bg-cyan-400" />
            <span>Operator Input</span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4 font-mono text-sm leading-relaxed min-h-[120px] lg:min-h-0">
            {transcript ? (
              <p className="text-cyan-100/90 friday-type-in">{transcript}</p>
            ) : (
              <p className="text-cyan-700/50 text-xs">
                {phase === "listening"
                  ? "Awaiting voice command…"
                  : phase === "processing" || phase === "starting"
                    ? "Processing…"
                    : phase === "speaking"
                      ? "Transmitting…"
                      : micEnabled
                        ? "Stand by for input"
                        : "Microphone muted"}
              </p>
            )}
          </div>
        </section>

        <section className="relative flex flex-col items-center justify-center min-h-0 order-1 lg:order-2">
          <div className="friday-core relative w-full aspect-square max-w-[360px] flex items-center justify-center">
            <VoiceAura phase={phase} audioLevels={audioLevels} />
            <SciFiMatrix phase={phase} audioLevels={audioLevels} />
          </div>

          <button
            type="button"
            onClick={toggleMic}
            disabled={voiceReady === false}
            className={`friday-mic-btn relative z-20 mt-8 shrink-0 ${
              micActive ? "friday-mic-btn-active" : ""
            } ${!micEnabled && phase !== "idle" ? "friday-mic-btn-muted" : ""}`}
            aria-label={micEnabled ? "Mute microphone" : "Enable microphone"}
            aria-pressed={micEnabled}
          >
            <MicIcon active={micEnabled} />
          </button>
        </section>

        <section className="friday-panel flex flex-col min-h-0 order-3">
          <div className="friday-panel-header">
            <span className="friday-panel-dot bg-emerald-400" />
            <span>FRIDAY Output</span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4 font-mono text-sm leading-relaxed min-h-[120px] lg:min-h-0">
            {lastAnswer ? (
              <p className="text-emerald-100/90 friday-type-in">{lastAnswer}</p>
            ) : greeting &&
              (phase === "speaking" ||
                phase === "listening" ||
                phase === "mic_paused" ||
                phase === "starting") ? (
              <p className="text-emerald-100/70 friday-type-in">{greeting}</p>
            ) : (
              <p className="text-emerald-700/50 text-xs">
                {phase === "processing" || phase === "starting"
                  ? "Analyzing request…"
                  : "Response channel ready"}
              </p>
            )}
          </div>
        </section>
      </main>

      {error && (
        <p className="relative z-10 text-center text-xs font-mono text-red-400/90 px-4 pb-2">
          {error}
        </p>
      )}

      <footer className="relative z-10 p-6">
        <button
          type="button"
          onClick={() => {
            stopSession();
            onClose();
          }}
          className="friday-close-btn"
          aria-label="Close Friday mode"
        >
          <span className="friday-close-icon" aria-hidden>
            ✕
          </span>
          <span>Exit Interface</span>
        </button>
      </footer>
    </div>
  );
}
