/* @vitest-environment jsdom */
// T73 on the page: the browser as a witness, the alerts an Administrator sees,
// and Root's acknowledgement.
import { render, type ReactiveControllerHost } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import {
  GovernanceApi,
  GovernanceApiError,
  type GovernanceIdentity,
  type GovernanceIntegrityAlert,
  type GovernanceLedgerReceipt,
  type GovernanceWitnessResult,
} from "./api.ts";
import { IntegrityController, WITNESS_STORAGE_KEY } from "./integrity-controller.ts";
import { renderIntegrityAlerts } from "./panels/integrity-panel.ts";
import { renderLedgerSection } from "./panels/oversight-panels.ts";

const HEAD: GovernanceLedgerReceipt = {
  groupId: "group-1",
  seq: 41,
  hash: "a".repeat(64),
  receipt: "b".repeat(64),
};

const ALERT: GovernanceIntegrityAlert = {
  seq: 42,
  action: "governance.ledger.gap",
  timestamp: "2026-10-04T09:00:00.000Z",
  summary: "Integrity alert: the checkpoint records entry #40 …, so 3 entries were removed",
  subject: "checkpoint:40:abc",
};

function harness(role: GovernanceIdentity["role"] = "root") {
  let identity: GovernanceIdentity | null = { username: "kinan", role };
  const api = new GovernanceApi("", null);
  let witness: GovernanceWitnessResult = { status: "none", head: HEAD };
  let alerts: GovernanceIntegrityAlert[] = [ALERT];
  const witnessLedger = vi.spyOn(api, "witnessLedger").mockImplementation(async () => witness);
  const integrityAlerts = vi
    .spyOn(api, "integrityAlerts")
    .mockImplementation(async () => ({ alerts }));
  const acknowledge = vi
    .spyOn(api, "acknowledgeIntegrityAlert")
    .mockImplementation(async () => ({ ok: true, alerts: [] }));
  const host = Object.assign(document.createElement("div"), {
    addController: vi.fn(),
    removeController: vi.fn(),
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  }) as unknown as ReactiveControllerHost & HTMLDivElement & { updateComplete: Promise<unknown> };
  document.body.append(host);
  const onSessionLost = vi.fn();
  const controller = new IntegrityController(host, {
    api: () => api,
    identity: () => identity,
    onSessionLost,
  });
  return {
    api,
    controller,
    host,
    witnessLedger,
    integrityAlerts,
    acknowledge,
    onSessionLost,
    draw: () => render(renderIntegrityAlerts(controller.slice()), host),
    setWitness: (next: GovernanceWitnessResult) => {
      witness = next;
    },
    setAlerts: (next: GovernanceIntegrityAlert[]) => {
      alerts = next;
    },
    signOutAndIn: (next: GovernanceIdentity["role"] = role) => {
      identity = null;
      controller.forget();
      identity = { username: "kinan", role: next };
    },
  };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
  window.localStorage.clear();
});

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("the browser as a witness", () => {
  it("keeps the head it is shown, and brings it back on the next sign-in", async () => {
    const page = harness();
    await page.controller.refresh();
    expect(page.witnessLedger).toHaveBeenCalledWith(undefined);
    expect(JSON.parse(window.localStorage.getItem(WITNESS_STORAGE_KEY) ?? "null")).toEqual(HEAD);

    // Once per sign-in, not on every refresh.
    await page.controller.refresh();
    expect(page.witnessLedger).toHaveBeenCalledTimes(1);

    page.signOutAndIn();
    await page.controller.refresh();
    expect(page.witnessLedger).toHaveBeenLastCalledWith(HEAD);
  });

  it("tells whoever is looking when the ledger no longer holds what this browser saw", async () => {
    window.localStorage.setItem(WITNESS_STORAGE_KEY, JSON.stringify(HEAD));
    const page = harness("viewer");
    page.setWitness({ status: "contradicted", alertSeq: 43, head: { ...HEAD, seq: 39 } });
    await page.controller.refresh();
    page.draw();
    const notice = page.host.querySelector("#governance-witness-notice");
    expect(notice?.getAttribute("role")).toBe("alert");
    expect(notice?.textContent).toContain("reach entry #41");
    // From here on it witnesses the ledger as it now stands.
    expect(JSON.parse(window.localStorage.getItem(WITNESS_STORAGE_KEY) ?? "null").seq).toBe(39);
    (notice?.querySelector("button") as HTMLButtonElement | null)?.click();
    page.draw();
    expect(page.host.querySelector("#governance-witness-notice")).toBeNull();
  });

  it("works with no browser storage at all", async () => {
    const page = harness();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await page.controller.refresh();
    expect(page.witnessLedger).toHaveBeenCalledWith(undefined);
    page.draw();
    expect(page.host.querySelector("#governance-integrity-alerts")).not.toBeNull();
  });

  it("forgets a witness result that straddled a sign-out", async () => {
    const page = harness();
    let release!: () => void;
    page.witnessLedger.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ status: "contradicted", head: HEAD });
        }),
    );
    window.localStorage.setItem(WITNESS_STORAGE_KEY, JSON.stringify(HEAD));
    const pending = page.controller.refresh();
    page.controller.forget();
    release();
    await pending;
    expect(page.controller.slice().contradictedSeq).toBeNull();
  });
});

describe("the alerts banner", () => {
  it("shows Root each unacknowledged alert with a reason field, and acknowledges it", async () => {
    const page = harness("root");
    await page.controller.refresh();
    page.draw();
    const band = page.host.querySelector("#governance-integrity-alerts");
    expect(band?.textContent).toContain("Entry #42");
    expect(band?.textContent).toContain("3 entries were removed");
    const button = band?.querySelector("button.btn.primary") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    page.controller.slice().setDraft(42, "restored from backup");
    page.draw();
    expect((page.host.querySelector("button.btn.primary") as HTMLButtonElement).disabled).toBe(
      false,
    );
    page.controller.slice().acknowledge(42);
    await vi.waitFor(() =>
      expect(page.acknowledge).toHaveBeenCalledWith(42, "restored from backup"),
    );
    await vi.waitFor(() => expect(page.controller.slice().alerts).toEqual([]));
    page.draw();
    expect(page.host.querySelector("#governance-integrity-alerts")).toBeNull();
  });

  it("shows an Administrator the alert and who must act, with nothing to press", async () => {
    const page = harness("administrator");
    await page.controller.refresh();
    page.draw();
    const band = page.host.querySelector("#governance-integrity-alerts");
    expect(band?.textContent).toContain("Only Root can acknowledge these");
    expect(band?.querySelector("textarea")).toBeNull();
    expect(band?.querySelector("button")).toBeNull();
  });

  it("does not ask for alerts below Administrator", async () => {
    const page = harness("user");
    await page.controller.refresh();
    expect(page.integrityAlerts).not.toHaveBeenCalled();
    page.draw();
    expect(page.host.querySelector("#governance-integrity-alerts")).toBeNull();
  });

  it("shows the server's words when an acknowledgement is refused", async () => {
    const page = harness("root");
    page.acknowledge.mockRejectedValue(
      new GovernanceApiError("There is no unacknowledged integrity alert #42.", 404),
    );
    await page.controller.refresh();
    page.controller.slice().setDraft(42, "why");
    page.controller.slice().acknowledge(42);
    await vi.waitFor(() =>
      expect(page.controller.slice().errors.get(42)).toContain("no unacknowledged"),
    );
  });

  it("ends the session on a 401 rather than going quiet", async () => {
    const page = harness("root");
    page.integrityAlerts.mockRejectedValue(new GovernanceApiError("expired", 401));
    await page.controller.refresh();
    expect(page.onSessionLost).toHaveBeenCalled();
  });
});

describe("a verification with alerts in the chain", () => {
  it("does not say intact alone", () => {
    const host = document.createElement("div");
    render(
      renderLedgerSection({
        ledger: [],
        ledgerFilter: "all",
        verification: {
          ok: true,
          entriesChecked: 7,
          evidence: { headSeq: 9, headHash: "c".repeat(64), checkpointSeq: 9, keyed: true },
          alerts: [
            {
              seq: 6,
              action: "governance.ledger.gap",
              timestamp: "2026-10-04T09:00:00.000Z",
              resource: "Integrity alert: entries were removed",
              missingFrom: 3,
              missingTo: 5,
            },
          ],
        },
        busy: false,
        onFilter: () => {},
        onVerify: () => {},
      }),
      host,
    );
    expect(host.textContent).toContain("Intact since 1 integrity alert(s) (7)");
    // And drawn as a caution, not as the green "ok" an intact chain gets.
    const status = [...host.querySelectorAll(".settings-status")].find((node) =>
      node.textContent?.includes("Intact since"),
    );
    expect(status?.classList.contains("settings-status--warn")).toBe(true);
    expect(host.textContent).toContain("Entries #3–#5 are missing.");
    expect(host.textContent).not.toMatch(/Intact, entries verified/);
  });
});
