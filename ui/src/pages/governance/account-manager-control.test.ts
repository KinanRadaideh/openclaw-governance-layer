/* @vitest-environment jsdom */
// Finding 383. Demoting or deleting an Administrator is refused while accounts answer to
// them, and the refusal says to assign those accounts to another Administrator first. No
// control on the page did that; this picker is it.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import { GovernanceApi, type GovernanceUserRecord } from "./api.ts";
import { renderAnswersToControl } from "./panels/account-manager-control.ts";
import { emptyAccountDrafts, type AccountsPanelProps } from "./panels/account-panels.ts";

const account = (id: string, role: GovernanceUserRecord["role"], managedBy?: string) =>
  ({
    id,
    username: id,
    role,
    createdAt: "2026-09-27T00:00:00.000Z",
    assignedAgents: [],
    ...(managedBy ? { managedBy } : {}),
  }) as GovernanceUserRecord;

function harness(target: GovernanceUserRecord, admins = ["ada", "omar"]) {
  const api = new GovernanceApi("", null);
  const setUserRole = vi.spyOn(api, "setUserRole").mockResolvedValue({ ok: true });
  const confirmThen = vi.fn(async (_options: unknown, action: () => Promise<unknown>) => {
    await action();
  });
  const administrators = admins.map((id) => account(id, "administrator"));
  const props = {
    api: () => api,
    run: async (action: () => Promise<unknown>) => {
      await action();
    },
    confirmThen,
    identity: { username: "root", role: "root", assignedAgents: [] },
    users: [...administrators, target],
    administrators,
    busy: false,
    drafts: emptyAccountDrafts(),
    onDraft: vi.fn(),
    setPassword: vi.fn(),
    reloadUsers: vi.fn(),
  } as unknown as AccountsPanelProps;
  const container = document.createElement("div");
  document.body.append(container);
  render(renderAnswersToControl(target, props), container);
  return { container, setUserRole, confirmThen, select: container.querySelector("select") };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("moving an account to another Administrator (finding 383)", () => {
  it("asks first, names both Administrators, and keeps the role", async () => {
    const h = harness(account("lina", "user", "ada"));
    expect(h.select?.value).toBe("ada");
    h.select!.value = "omar";
    h.select!.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(h.setUserRole).toHaveBeenCalledWith("lina", "user", "omar"));
    expect(h.confirmThen.mock.calls[0]?.[0]).toMatchObject({ details: "lina: ada → omar" });
    // The picker shows the server's state until the refresh brings the new one.
    expect(h.select?.value).toBe("ada");
  });

  it("is not offered to an Administrator, nor where there is nobody to move to", () => {
    expect(harness(account("zed", "administrator")).select).toBeNull();
    expect(harness(account("lina", "user", "ada"), ["ada"]).select).toBeNull();
  });
});
