/**
 * Animated aura rings around the matrix — reacts to voice session phase.
 */
export default function VoiceAura({ phase, audioLevels = [] }) {
  const avg =
    audioLevels.length > 0
      ? audioLevels.reduce((a, b) => a + b, 0) / audioLevels.length
      : 0;

  const isListening = phase === "listening";
  const isThinking = phase === "processing" || phase === "starting";
  const isSpeaking = phase === "speaking";

  const auraClass = isListening
    ? "friday-aura-listening"
    : isThinking
      ? "friday-aura-thinking"
      : isSpeaking
        ? "friday-aura-speaking"
        : "friday-aura-idle";

  const scale = isListening ? 1 + avg * 0.35 : 1;

  return (
    <div className="friday-aura-wrap pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className={`friday-aura-ring ${auraClass}`}
        style={{ transform: `scale(${scale})` }}
      />
      <div
        className={`friday-aura-ring friday-aura-ring-2 ${auraClass}`}
        style={{ transform: `scale(${0.85 + avg * 0.2})` }}
      />
      {isListening &&
        [0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="friday-aura-pulse"
            style={{
              "--pulse-delay": `${i * 0.35}s`,
              "--pulse-level": avg,
            }}
          />
        ))}
      {isThinking && <span className="friday-aura-scan" aria-hidden />}
    </div>
  );
}
