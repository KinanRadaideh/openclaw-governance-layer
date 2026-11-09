/**
 * Sanitize a web_fetch URL parameter that may contain LLM-injected whitespace.
 *
 * Fixes the reported case where a model emits a space between the scheme and
 * authority (e.g. `https:// docs.openclaw.ai`), which causes `new URL()` to
 * throw. Path and query whitespace is intentionally preserved — the WHATWG URL
 * parser percent-encodes those characters correctly per RFC 3986.
 *
 * **One function for the tool and the governance gate** (finding 452, QA of 2026-11-09). The
 * gate judges the address the tool will fetch, so it applies this same repair before any rule
 * sees the address (`repairNetworkAddress`, `src/governance/resource-extraction.ts`). While the
 * gate read the address as written, `https:// host` had no host it could judge, so no host rule
 * matched it and monitor posture let it through, while the tool repaired it and fetched the host.
 */
export function sanitizeWebFetchUrl(raw: string): string {
  let end = raw.length;
  while (end > 0 && raw.charCodeAt(end - 1) <= 0x20) {
    end -= 1;
  }
  const trimmed = raw.slice(0, end).replace(/^\s+/, "");
  const repaired = trimmed.replace(/^(https?:\/\/)\s+/i, "$1");
  return repaired.replace(/^(https?:\/\/[^/?#\s]+)\s+$/i, "$1");
}
