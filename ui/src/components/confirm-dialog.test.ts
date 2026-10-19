/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRenderedModalDialog, installDialogPolyfill } from "../test-helpers/modal-dialog.ts";
import { showChoiceDialog, showConfirmDialog } from "./confirm-dialog.ts";

let restoreDialogPolyfill: () => void;

function findButton(label: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected ${label} button`);
  }
  return button;
}

describe("showConfirmDialog", () => {
  beforeEach(() => {
    restoreDialogPolyfill = installDialogPolyfill();
  });

  afterEach(() => {
    document.body.replaceChildren();
    restoreDialogPolyfill();
  });

  it("renders accessible copy and resolves the selected action", async () => {
    const result = showConfirmDialog({
      title: "Delete thread?",
      message: "This cannot be undone.",
      details: "thread-1",
      confirmLabel: "Delete",
      danger: true,
    });
    const { modal, dialog } = await getRenderedModalDialog(document.body);

    expect(dialog.getAttribute("aria-label")).toBe("Delete thread?");
    expect(dialog.getAttribute("aria-description")).toBe("This cannot be undone.");
    expect(modal.textContent).toContain("thread-1");
    expect(findButton("Delete").classList.contains("danger")).toBe(true);

    findButton("Delete").click();

    await expect(result).resolves.toBe(true);
    expect(document.body.querySelector("openclaw-modal-dialog")).toBeNull();
  });

  it("treats modal dismissal as cancellation", async () => {
    const result = showConfirmDialog({ message: "Continue?" });
    const { modal } = await getRenderedModalDialog(document.body);

    modal.dispatchEvent(new CustomEvent("modal-cancel"));

    await expect(result).resolves.toBe(false);
  });

  it("removes the dialog and cancels when its owner aborts", async () => {
    const controller = new AbortController();
    const result = showConfirmDialog({ message: "Continue?", signal: controller.signal });
    await getRenderedModalDialog(document.body);

    controller.abort();

    await expect(result).resolves.toBe(false);
    expect(document.body.querySelector("openclaw-modal-dialog")).toBeNull();
  });

  it("rejects a reentrant confirmation instead of stacking or replaying it", async () => {
    const first = showConfirmDialog({ title: "First", message: "First action" });
    const second = showConfirmDialog({ title: "Second", message: "Second action" });
    await getRenderedModalDialog(document.body);

    expect(document.body.textContent).toContain("First");
    expect(document.body.textContent).not.toContain("Second");
    await expect(second).resolves.toBe(false);
    findButton("Cancel").click();
    await expect(first).resolves.toBe(false);
  });

  // The message box keeps line breaks (`white-space: pre-line`) so a message can be laid out
  // in paragraphs, and the template's own line break before the message was inside it: every
  // confirmation opened with an empty line above its text. Measured on a running Gateway:
  // the first word 21.5 px below the box's top, one line height (QA of 2026-10-19, part 2).
  it("draws the message and nothing else in its line-keeping box", async () => {
    const result = showConfirmDialog({ message: "First paragraph.\n\nSecond paragraph." });
    const { modal } = await getRenderedModalDialog(document.body);

    const box = modal.querySelector(".exec-approval-sub");
    expect(box?.textContent).toBe("First paragraph.\n\nSecond paragraph.");

    findButton("Cancel").click();
    await expect(result).resolves.toBe(false);
  });
});

describe("showChoiceDialog", () => {
  beforeEach(() => {
    restoreDialogPolyfill = installDialogPolyfill();
  });

  afterEach(() => {
    document.body.replaceChildren();
    restoreDialogPolyfill();
  });

  it("draws the message and each choice's description with no added line breaks", async () => {
    const result = showChoiceDialog({
      message: "Delete this agent?",
      choices: [{ value: "keep", label: "Keep files", description: "Line one.\nLine two." }],
    });
    const { modal } = await getRenderedModalDialog(document.body);

    expect(modal.querySelector(".exec-approval-sub")?.textContent).toBe("Delete this agent?");
    expect(modal.querySelector(".exec-approval-command")?.textContent).toBe("Line one.\nLine two.");

    findButton("Cancel").click();
    await expect(result).resolves.toBeNull();
  });
});
