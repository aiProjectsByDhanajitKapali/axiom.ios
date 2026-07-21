const BAR_COUNT = 56;

/**
 * Live mic level graph: active waveform while speaking, flat line when silent (pause cue).
 */
export default function VoiceLevelGraph({
  levels = [],
  active = false,
  isSilent = false,
  silenceProgress = 0,
  threshold = null,
}) {
  const samples =
    levels.length >= BAR_COUNT
      ? levels.slice(-BAR_COUNT)
      : [...Array(BAR_COUNT - levels.length).fill(0), ...levels];

  const midY = 24;
  const barW = 280 / BAR_COUNT;
  const maxH = 20;

  return (
    <div className="w-full">
      <div className="rounded-lg border border-axiom-border bg-axiom-panel/80 px-3 py-3">
        <svg
          viewBox="0 0 280 48"
          className="w-full h-14"
          role="img"
          aria-label={
            active
              ? isSilent
                ? "Microphone silent, hold pause to send"
                : "Microphone level active"
              : "Microphone level idle"
          }
        >
          {/* center baseline */}
          <line
            x1="0"
            y1={midY}
            x2="280"
            y2={midY}
            stroke="#30363d"
            strokeWidth="1"
            strokeDasharray={active && isSilent ? "4 3" : "0"}
          />

          {/* adaptive noise threshold: bars must drop below this to count as a pause */}
          {active && threshold != null && threshold < 1 && (
            <>
              <line
                x1="0"
                y1={midY - Math.min(1, threshold) * maxH}
                x2="280"
                y2={midY - Math.min(1, threshold) * maxH}
                stroke="#7c9aff"
                strokeWidth="1"
                strokeDasharray="2 4"
                opacity="0.55"
              />
              <line
                x1="0"
                y1={midY + Math.min(1, threshold) * maxH}
                x2="280"
                y2={midY + Math.min(1, threshold) * maxH}
                stroke="#7c9aff"
                strokeWidth="1"
                strokeDasharray="2 4"
                opacity="0.55"
              />
            </>
          )}

          {samples.map((level, i) => {
            const h = Math.max(1, level * maxH);
            const x = i * barW + barW * 0.15;
            const w = barW * 0.7;
            const speaking = active && level > 0.06;
            const fill = !active
              ? "#30363d"
              : isSilent && !speaking
                ? "#484f58"
                : "#58a6ff";

            return (
              <rect
                key={i}
                x={x}
                y={midY - h}
                width={w}
                height={h * 2}
                rx={1}
                fill={fill}
                opacity={active ? 0.35 + level * 0.65 : 0.25}
              />
            );
          })}

          {/* silence → send progress */}
          {active && isSilent && silenceProgress > 0 && (
            <rect
              x="0"
              y="44"
              width={280 * Math.min(1, silenceProgress)}
              height="3"
              fill="#58a6ff"
              opacity="0.85"
              rx="1"
            />
          )}
        </svg>

        <p className="mt-2 text-xs text-center font-mono">
          {!active ? (
            <span className="text-axiom-muted">Levels appear when listening</span>
          ) : isSilent ? (
            <span className="text-axiom-accent">
              Quiet — hold pause ~1.5s to send
            </span>
          ) : (
            <span className="text-axiom-muted">
              Speak now — drop below the dotted line to send
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
