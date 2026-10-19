/* @vitest-environment jsdom */

// The second QA of 2026-10-19: the parts the first one built and nobody had checked
// (`mg/QA-SESSION-2026-10-19-PART2.md`). Finding 437, the rule notice outliving a rule
// removed elsewhere, is pinned beside its siblings in `rule-check-before-write.test.ts`.
import { render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GovernanceApi, GovernanceUserRecord } from "./api.ts";
import {
  emptyAccountDrafts,
  renderUsersSection,
  type AccountDrafts,
} from "./panels/account-panels.ts";
// Registers the governance strings, as the page does.
import "./governance-page.ts";

const LINA = {
  id: "user-3",
  username: "lina",
  role: "user",
  assignedAgents: ["main"],
  managedBy: "ada",
} as GovernanceUserRecord;

afterEach(() => {
  document.body.replaceChildren();
});

// Finding 438. Set password refused a short password through the banner at the top of the
// page, the shape finding 434 removed from Create account: far from the row, and, once a
// valid password was typed and its confirmation cancelled, still saying "Password must be
// at least 8 characters" about a password that met the rule (the 2026-09-27 observation,
// never fixed). Now the row says it and holds its button, as Create account does.
describe("Set password states the password rule in its own row", () => {
  function mountRow(typed: string) {
    const setPassword = vi.fn(async () => {});
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const drafts: AccountDrafts = { ...emptyAccountDrafts(), passwordEdits: { [LINA.id]: typed } };
    render(
      renderUsersSection({
        api: () => ({}) as unknown as GovernanceApi,
        run: async (action) => {
          await action();
        },
        confirmThen: async () => {},
        identity: { username: "root", role: "root", assignedAgents: [] },
        users: [LINA],
        administrators: [],
        busy: false,
        drafts,
        onDraft: () => {},
        setPassword,
        reloadUsers: async () => {},
      }),
      host,
    );
    const field = host.querySelector<HTMLInputElement>('input[aria-label*="lina"]');
    const row = field?.parentElement ?? host;
    const button = [...row.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Set password",
    );
    return { row, button, setPassword };
  }

  it("holds the button and says why while the password is too short", () => {
    const { row, button } = mountRow("short");
    expect(button?.disabled).toBe(true);
    expect((row.textContent ?? "").replace(/\s+/g, " ")).toContain(
      "Password must be at least 8 characters.",
    );
  });

  it("allows it, and says nothing, once the password is long enough", () => {
    const { row, button } = mountRow("long-enough");
    expect(button?.disabled).toBe(false);
    expect(row.textContent ?? "").not.toContain("Password must be at least");
  });
});
