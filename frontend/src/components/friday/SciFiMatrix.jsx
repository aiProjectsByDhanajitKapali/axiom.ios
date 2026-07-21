const GRID = [-1, 0, 1];
const FACES = ["front", "back", "left", "right", "top", "bottom"];

// rgb triplets consumed as rgba(var(--mx), alpha) in CSS
const PHASE_COLOR = {
  listening: "52, 211, 153", // green — audio in
  processing: "59, 130, 246", // blue — thinking
  starting: "59, 130, 246",
  speaking: "34, 211, 238", // cyan — output
  idle: "103, 232, 249",
  mic_paused: "100, 116, 139", // slate — muted
};

const PHASE_SPIN = {
  listening: "7s",
  processing: "11s",
  starting: "11s",
  speaking: "9s",
};

/**
 * Ra.One-style holographic cube matrix: a 3×3×3 lattice of wireframe cubes
 * that tumbles and breathes while the session is active. Frozen and dimmed
 * when idle or the mic is off; edge color tracks the session phase.
 */
export default function SciFiMatrix({ phase = "idle", audioLevels = [] }) {
  const avg =
    audioLevels.length > 0
      ? audioLevels.reduce((a, b) => a + b, 0) / audioLevels.length
      : 0;

  const active = phase in PHASE_SPIN;
  const color = PHASE_COLOR[phase] ?? PHASE_COLOR.idle;
  const scale = phase === "listening" ? 1 + avg * 0.2 : 1;

  const cubes = [];
  for (const gx of GRID) {
    for (const gy of GRID) {
      for (const gz of GRID) {
        // diagonal wave: cubes on the same x+y+z plane pulse together
        cubes.push({ gx, gy, gz, delay: (gx + gy + gz + 3) * 0.14 });
      }
    }
  }

  return (
    <div className="cube-stage" aria-hidden>
      <div className="cube-scale" style={{ transform: `scale(${scale})` }}>
        <div
          className={`cube-lattice ${active ? "" : "cube-lattice-idle"}`}
          style={{ "--mx": color, "--spin": PHASE_SPIN[phase] || "12s" }}
        >
          {cubes.map(({ gx, gy, gz, delay }) => (
            <div
              key={`${gx}:${gy}:${gz}`}
              className="mini-cube"
              style={{ "--gx": gx, "--gy": gy, "--gz": gz }}
            >
              <div
                className="mini-cube-body"
                style={{ animationDelay: `${delay}s` }}
              >
                {FACES.map((f) => (
                  <div key={f} className={`mini-cube-face mcf-${f}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
