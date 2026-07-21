/** Format milliseconds for UI labels (e.g. 847ms, 2.4s). */
export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
