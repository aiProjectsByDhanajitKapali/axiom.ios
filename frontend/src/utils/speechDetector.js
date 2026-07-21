const SPEECH_BAND_HZ = [300, 3400];
const FLOOR_WINDOW = 240; // ~4s of frames at 60fps
const FLOOR_PERCENTILE = 0.2;
const FLOOR_RISE_PER_FRAME = 0.0004; // floor falls instantly, rises slowly
const MARGIN_RATIO = 0.5;
const MIN_MARGIN = 0.05;
const MIN_FLOOR_SAMPLES = 12;

/**
 * Adaptive voice-activity detector.
 *
 * Steady background noise (fans, AC, traffic hum) keeps a fixed RMS threshold
 * permanently "loud", so a pause is never detected. This detector instead:
 *  1. measures energy only in the speech band (300–3400 Hz), which excludes
 *     most fan rumble, and
 *  2. tracks the ambient noise floor adaptively (rolling low percentile that
 *     falls fast and rises slowly), so "silence" means "back down at the
 *     room's own baseline", whatever that baseline is.
 */
export function createSpeechDetector(analyser, sampleRate) {
  const binHz = sampleRate / analyser.fftSize;
  const lo = Math.max(1, Math.floor(SPEECH_BAND_HZ[0] / binHz));
  const hi = Math.min(analyser.frequencyBinCount - 1, Math.ceil(SPEECH_BAND_HZ[1] / binHz));
  const freq = new Uint8Array(analyser.frequencyBinCount);
  const recent = [];
  let floor = null;

  return {
    /** Returns { level, threshold, silent } — all normalized 0..1. */
    sample() {
      analyser.getByteFrequencyData(freq);
      let sum = 0;
      for (let i = lo; i <= hi; i += 1) sum += freq[i];
      const level = sum / ((hi - lo + 1) * 255);

      recent.push(level);
      if (recent.length > FLOOR_WINDOW) recent.shift();

      if (recent.length >= MIN_FLOOR_SAMPLES) {
        const sorted = [...recent].sort((a, b) => a - b);
        const candidate = sorted[Math.floor(sorted.length * FLOOR_PERCENTILE)];
        if (floor === null || candidate < floor) {
          floor = candidate;
        } else {
          floor = Math.min(candidate, floor + FLOOR_RISE_PER_FRAME);
        }
      }

      const ready = floor !== null;
      const threshold = ready
        ? Math.min(0.95, floor + Math.max(floor * MARGIN_RATIO, MIN_MARGIN))
        : 1;

      return { level, threshold, silent: ready && level < threshold };
    },
  };
}
