/* @vitest-environment jsdom */
// T76 on the page: a deletion that finished incompletely says so, and Root can
// finish it. T78 on the page: the sign-in refusal a malformed cookie now earns is
// read as "sign in again", and a plain 401 is still the Gateway's.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import { refusal } from "./api.errors.ts";
import { GovernanceApi } from "./api.ts";
import { isSessionLost } from "./identity.ts";
import {
  deleteAccountAndReport,
  renderAccountDeletionNotice,
  type AccountDeletionNotice,
} from "./panels/account-deletion.ts";

function harness() {
  const api = new GovernanceApi("", null);
  let notice: AccountDeletionNotice | null = null;
  const host = document.createElement("div");
  document.body.append(host);
  const props = () => ({
    api: () => api,
    run: async (action: () => Promise<unknown>) => {
      await action();
    },
    busy: false,
    notice,
    setNotice: (next: AccountDeletionNotice | null) => {
      notice = next;
    },
  });
  return {
    api,
    host,
    props,
    notice: () => notice,
    draw: () => render(renderAccountDeletionNotice(props()), host),
  };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("T76: a deletion that left something to finish", () => {
  it("says nothing when the deletion completed", async () => {
    const page = harness();
    vi.spyOn(page.api, "deleteUser").mockResolvedValue({
      ok: true,
      username: "lina",
      sessionsRevoked: 2,
    });
    await deleteAccountAndReport(page.props(), "id-lina");
    expect(page.notice()).toBeNull();
    page.draw();
    expect(page.host.textContent?.trim()).toBe("");
  });

  it("says the account is gone and signed out, what is left, and finishes it", async () => {
    const page = harness();
    vi.spyOn(page.api, "deleteUser").mockResolvedValue({
      ok: true,
      username: "lina",
      sessionsRevoked: 1,
      cleanupError: "EBUSY: conversation store",
    });
    await deleteAccountAndReport(page.props(), "id-lina");
    page.draw();
    const text = page.host.textContent ?? "";
    expect(text).toContain("lina was deleted, but not everything was finished");
    expect(text).toContain("every session it had is signed out");
    expect(text).toContain("Still held under the name: EBUSY: conversation store");
    expect(text).toContain("Deleted and signed out");

    const finish = vi
      .spyOn(page.api, "finishUserDeletion")
      .mockResolvedValue({ ok: true, username: "lina", sessionsRevoked: 0 });
    (page.host.querySelector("button.btn.primary") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(finish).toHaveBeenCalledWith("id-lina", "lina"));
    await vi.waitFor(() => expect(page.notice()).toBeNull());
  });

  it("keeps the notice, with the new reason, when finishing fails again", async () => {
    const page = harness();
    vi.spyOn(page.api, "deleteUser").mockResolvedValue({
      ok: true,
      username: "lina",
      sessionsRevoked: 1,
      auditError: "ledger key unusable",
    });
    await deleteAccountAndReport(page.props(), "id-lina");
    page.draw();
    expect(page.host.textContent).toContain("did not record the deletion: ledger key unusable");
    vi.spyOn(page.api, "finishUserDeletion").mockResolvedValue({
      ok: true,
      username: "lina",
      sessionsRevoked: 0,
      auditError: "still unusable",
    });
    (page.host.querySelector("button.btn.primary") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(page.notice()?.auditError).toBe("still unusable"));
  });
});

describe("T78: the refusal a malformed cookie earns", () => {
  it("is read as the governance sign-in being gone", () => {
    expect(
      isSessionLost(refusal("Governance login required", 401, "governance_login_required")),
    ).toBe(true);
  });

  it("leaves an untyped 401 to the Gateway's reconnection, as before", () => {
    expect(isSessionLost(refusal("Unauthorized", 401, undefined))).toBe(false);
  });
});
