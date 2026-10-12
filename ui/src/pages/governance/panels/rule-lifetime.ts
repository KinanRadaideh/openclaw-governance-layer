// How long a rule made from a request lasts (T86 D5, option A, Kinan 2026-10-11).
//
// Only "Add a rule" could make a rule that expires; a rule made by approving a request,
// including every "Always allow" answer, never did. One choice, offered in the three
// places such a rule is asked for or granted: the request form, the approval row, and
// beside "Always allow". The default everywhere is "never expires", so nothing changes
// unless somebody chooses. A short list rather than "Add a rule"'s minutes box, because
// two of the three are pressed in the middle of reading something else; the server
// takes any number of minutes, and a value from elsewhere is shown as it is.
import { html } from "lit";
import { t } from "../../../i18n/index.ts";

/** The select's value for "never expires". */
export const NEVER = "never";

const PRESET_MINUTES = [60, 480, 1440, 10080, 43200] as const;

/** A lifetime in words: "1 day", "8 hours", "90 minutes". */
export function lifetimeWords(minutes: number): string {
  if (minutes % 1440 === 0) {
    const count = minutes / 1440;
    return t(count === 1 ? "governance.lifetime.day" : "governance.lifetime.days", {
      count: String(count),
    });
  }
  if (minutes % 60 === 0) {
    const count = minutes / 60;
    return t(count === 1 ? "governance.lifetime.hour" : "governance.lifetime.hours", {
      count: String(count),
    });
  }
  return t(minutes === 1 ? "governance.lifetime.minute" : "governance.lifetime.minutes", {
    count: String(minutes),
  });
}

/** The select's value for a lifetime: `NEVER` when there is none. */
export function lifetimeValue(minutes: number | undefined): string {
  return minutes ? String(minutes) : NEVER;
}

/** The minutes a select value stands for, or `null` for "never expires". */
export function lifetimeMinutes(value: string): number | null {
  const minutes = Number(value);
  return value !== NEVER && Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

export function renderRuleLifetimeSelect(props: {
  value: string;
  label: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const minutes = lifetimeMinutes(props.value);
  // A lifetime asked for elsewhere (the API, or a value no longer in the list) is kept
  // selectable, so showing a request never quietly changes what approving it grants.
  const choices =
    minutes !== null && !PRESET_MINUTES.includes(minutes as (typeof PRESET_MINUTES)[number])
      ? [...PRESET_MINUTES, minutes].toSorted((a, b) => a - b)
      : PRESET_MINUTES;
  return html`<select
    class="input"
    aria-label=${props.label}
    title=${props.label}
    .value=${props.value}
    ?disabled=${props.disabled ?? false}
    @change=${(event: Event) => props.onChange((event.target as HTMLSelectElement).value)}
  >
    <option value=${NEVER} ?selected=${minutes === null}>${t("governance.lifetime.never")}</option>
    ${choices.map(
      (choice) =>
        html`<option value=${String(choice)} ?selected=${choice === minutes}>
          ${t("governance.lifetime.lasts", { duration: lifetimeWords(choice) })}
        </option>`,
    )}
  </select>`;
}
