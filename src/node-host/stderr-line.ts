/** The node host's own diagnostic lines on stderr, for the runner and the macOS app's worker. */
import { redactLogText } from "../logging/redact-log.js";

/**
 * Writes one line to stderr through both log passes (T85). Under a service manager stderr is the
 * node host's log (the journal under systemd), and the macOS app writes the worker's stderr to
 * its system log; until T85 these lines had no redaction at all.
 */
export function writeNodeHostStderrLine(message: string): void {
  process.stderr.write(`${redactLogText(message)}\n`);
}
