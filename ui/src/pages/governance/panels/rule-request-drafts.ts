// The rule-request queue's draft state, held off the page (A11).
//
// Moved out of `governance-page.ts` when A11's form added five fields to the four already
// there and took the page past its 700-line limit. The seam `AccountsController` set: the
// owner of the half-typed fields knows how to empty them, and the page spreads one
// `slice()` into the section instead of copying each field across by hand.
import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { GovernancePolicyRule } from "../api.ts";
import type { AgentSettingRequestDrafts } from "./agent-setting-request.ts";

export type RuleRequestDrafts = AgentSettingRequestDrafts & {
  requestKind: GovernancePolicyRule["resourceKind"];
  requestPattern: string;
  requestReason: string;
  requestAgentId: string;
  /** A path request's direction; empty asks for both. Not sent for other kinds. */
  requestAccess: "" | "read" | "write";
};

export function emptyRuleRequestDrafts(): RuleRequestDrafts {
  return {
    requestKind: "command",
    requestPattern: "",
    requestReason: "",
    requestAgentId: "",
    requestAccess: "",
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
