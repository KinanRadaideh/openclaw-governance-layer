// The rule-request queue's draft state, held off the page (A11).
//
// Moved out of `governance-page.ts` when A11's form added five fields to the four already
// there and took the page past its 700-line limit. The seam `AccountsController` set: the
// owner of the half-typed fields knows how to empty them, and the page spreads one
// `slice()` into the section instead of copying each field across by hand.
import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { GovernancePolicyRule } from "../api.ts";
import type { AgentSettingRequestDrafts } from "./agent-setting-request.ts";
import { NEVER } from "./rule-lifetime.ts";

export type RuleRequestDrafts = AgentSettingRequestDrafts & {
  requestKind: GovernancePolicyRule["resourceKind"];
  requestPattern: string;
  requestReason: string;
  requestAgentId: string;
  /** A path request's direction; empty asks for both. Not sent for other kinds. */
  requestAccess: "" | "read" | "write";
  /**
   * The note an Administrator is typing back to a requester, and which request it is
   * for: one box per pending row, one draft, so a note typed on one row never rides
   * along with a press on another (407's per-row shape).
   */
  decisionNoteFor: string;
  decisionNote: string;
  /** How long the filed rule should last once approved (T86 D5); `NEVER` asks for no limit. */
  requestLifetime: string;
  /**
   * The lifetime an Administrator chose on one pending row, and which row, on the note's
   * per-row shape. A row with no choice of its own approves what its request asked for.
   */
  decisionLifetimeFor: string;
  decisionLifetime: string;
};

export function emptyRuleRequestDrafts(): RuleRequestDrafts {
  return {
    requestKind: "command",
    requestPattern: "",
    requestReason: "",
    requestAgentId: "",
    requestAccess: "",
    decisionNoteFor: "",
    decisionNote: "",
    requestLifetime: NEVER,
    decisionLifetimeFor: "",
    decisionLifetime: NEVER,
    settingAgentId: "",
    settingKind: "mode",
    settingValue: "",
    settingReason: "",
  };
}

export class RuleRequestDraftsController implements ReactiveController {
  private drafts: RuleRequestDrafts = emptyRuleRequestDrafts();

  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }

  /** Required by `ReactiveController`; this controller has no connect-time work. */
  hostConnected(): void {}

  slice(): { drafts: RuleRequestDrafts; onDraft: (patch: Partial<RuleRequestDrafts>) => void } {
    return {
      drafts: this.drafts,
      onDraft: (patch) => {
        // Replaced rather than mutated, then the host is told: Lit re-renders on identity.
        this.drafts = { ...this.drafts, ...patch };
        this.host.requestUpdate();
      },
    };
  }

  /** Empties every field, when the session they were typed in ends. */
  reset(): void {
    this.drafts = emptyRuleRequestDrafts();
    this.host.requestUpdate();
  }
}
