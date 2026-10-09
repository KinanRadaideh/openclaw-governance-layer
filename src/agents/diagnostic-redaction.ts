import { redactLogValue } from "../logging/redact-log.js";
import { sanitizeDiagnosticPayload } from "./payload-redaction.js";

export function redactAgentDiagnosticPayload<T>(value: T): T {
  // The payload log and cache trace are logs: both passes (finding 421).
  return redactLogValue(sanitizeDiagnosticPayload(value)) as T;
}
