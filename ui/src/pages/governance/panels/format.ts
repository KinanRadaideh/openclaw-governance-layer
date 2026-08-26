// Two formatters shared by the page and its panels.
//
// Their own module rather than duplicated or re-exported from the page (T16):
// the panels must not import from `governance-page.ts`, because the page
// imports them and a cycle between a component and its own views is the kind of
// thing that works until a bundler is asked to tree-shake it.
//
// Small on purpose. A "utils" file is where unrelated helpers accumulate; this
// one is named for what both of these do and nothing else belongs in it.
/** Compact human duration for run ages: 45s, 12m 30s, 3h 04m. */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * Human-readable byte size for an attachment chip.
 *
 * Deliberately coarse. The chip exists so an operator can see they queued the
 * 4 MB screenshot rather than the 4 KB one; the exact figure is in the ledger,
 * which is where a number anybody has to rely on belongs.
 */
export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
