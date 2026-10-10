// What every governance request sends and what every reply is checked for, apart from errors.
// Split from `api.ts` on 2026-10-10 (T77) to keep that file within its line limit.

/**
 * The headers of one request. `Record<string, string>` rather than `HeadersInit`: this only ever
 * returns a plain object, and the wider union includes `string[][]`, which spreads into an object
 * literal as indices rather than headers.
 */
export function governanceRequestHeaders(
  authToken: string | null,
  json: boolean,
): Record<string, string> {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

/**
 * Tells `onLag` when a successful reply says the change stands while the signed-in sessions it
 * affects keep the narrower access until their holders sign in again (T77, `sessionsError`).
 * Heard at the one place every reply passes, because several panels discard the reply of the
 * call they make.
 */
export function reportSessionsLag(parsed: unknown, onLag?: (reason: string) => void): void {
  const reason =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { sessionsError?: unknown }).sessionsError
      : undefined;
  if (typeof reason === "string") {
    onLag?.(reason);
  }
}
