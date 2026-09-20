// Wizard i18n tests cover locale lookup and fallback behavior through retained translators.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSetupTranslator, t } from "./index.js";
import { en } from "./locales/en.js";
import { zh_CN } from "./locales/zh-CN.js";
import { zh_TW } from "./locales/zh-TW.js";
import type { WizardTranslationTree } from "./types.js";

function collectLeafKeys(tree: WizardTranslationTree, prefix = "", out: string[] = []): string[] {
  for (const [key, value] of Object.entries(tree)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out.push(next);
    } else {
      collectLeafKeys(value, next, out);
    }
  }
  return out;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("wizard i18n", () => {
  it.each([
    ["zh_CN.UTF-8", "Gateway 端口"],
    ["zh-Hans", "Gateway 端口"],
    ["zh_TW.UTF-8", "Gateway 連接埠"],
    ["zh-HK", "Gateway 連接埠"],
    ["en_US.UTF-8", "Gateway port"],
    ["de_DE.UTF-8", "Gateway port"],
  ])("resolves the %s CLI locale through translated setup copy", (locale, expected) => {
    vi.stubEnv("OPENCLAW_LOCALE", locale);
    expect(t("wizard.gateway.port")).toBe(expected);
  });

  it("uses OPENCLAW_LOCALE before process locale variables", () => {
    vi.stubEnv("OPENCLAW_LOCALE", "en");
    vi.stubEnv("LC_ALL", "zh-CN");
    vi.stubEnv("LANG", "zh-TW");
    expect(t("wizard.gateway.port")).toBe("Gateway port");
  });

  it("ignores blank locale overrides when a process locale is available", () => {
    vi.stubEnv("OPENCLAW_LOCALE", "   ");
    vi.stubEnv("LC_ALL", "");
    vi.stubEnv("LC_MESSAGES", "zh-CN");
    vi.stubEnv("LANG", "en-US");
    expect(t("wizard.gateway.port")).toBe("Gateway 端口");
  });

  it("continues through a blank LC_MESSAGES value to LANG", () => {
    vi.stubEnv("OPENCLAW_LOCALE", "");
    vi.stubEnv("LC_ALL", " ");
    vi.stubEnv("LC_MESSAGES", "\t");
    vi.stubEnv("LANG", "zh-TW");
    expect(t("wizard.gateway.port")).toBe("Gateway 連接埠");
  });

  it("uses English when every locale variable is blank", () => {
    vi.stubEnv("OPENCLAW_LOCALE", " ");
    vi.stubEnv("LC_ALL", "");
    vi.stubEnv("LC_MESSAGES", "\t");
    vi.stubEnv("LANG", "  ");
    expect(t("wizard.gateway.port")).toBe("Gateway port");
  });

  it("falls back to English and interpolates params", () => {
    expect(t("wizard.gateway.port", undefined, { locale: "zh-CN" })).toBe("Gateway 端口");
    expect(t("wizard.gateway.missing", undefined, { locale: "zh-CN" })).toBe(
      "wizard.gateway.missing",
    );
    expect(
      t(
        "wizard.customProvider.endpointIdRenamed",
        { from: "custom", to: "custom-2" },
        { locale: "en" },
      ),
    ).toBe('Endpoint ID "custom" already exists for a different base URL. Using "custom-2".');
  });

  it("creates scoped setup translators without exporting a generic SDK t helper", () => {
    const telegramT = createSetupTranslator({
      keyPrefix: "wizard.telegram",
      locale: "zh-CN",
    });
    expect(telegramT("botToken")).toBe("Telegram bot token");
    expect(telegramT("wizard.gateway.port")).toBe("Gateway 端口");
  });

  it("keeps shipped locale keys aligned with English", () => {
    const english = collectLeafKeys(en).toSorted();
    for (const [locale, translations] of [
      ["zh-CN", zh_CN],
      ["zh-TW", zh_TW],
    ] as const) {
      expect(collectLeafKeys(translations).toSorted(), locale).toEqual(english);
    }
  });
  // T46/C4: an operator installing this fork must be told what it is. The banner and
  // the completion text name the governance layer; the prompts in between are upstream's.
  describe("governance wording (T46)", () => {
    it("names the fork in both setup banners", () => {
      expect(t("wizard.setup.intro", undefined, { locale: "en" })).toBe(
        "OpenClaw Governance setup",
      );
      expect(t("wizard.guided.custodianIntro", undefined, { locale: "en" })).toContain(
        "OpenClaw Governance",
      );
    });

    it("says what the layer does in the guided banner", () => {
      const banner = t("wizard.guided.custodianIntro", undefined, { locale: "en" });
      expect(banner).toContain("policy");
      expect(banner).toContain("audit ledger");
    });

    it("names the fork and the gate in the completion text", () => {
      const done = t("wizard.guided.complete", undefined, { locale: "en" });
      expect(done).toContain("OpenClaw Governance");
      expect(done).toContain("policy gate");
      expect(t("wizard.guided.completeWithoutAi", undefined, { locale: "en" })).toContain(
        "OpenClaw Governance",
      );
    });

    it("points next steps at the governance section and the first Root", () => {
      for (const key of ["wizard.guided.nextSteps", "wizard.guided.nextStepsWithoutAi"] as const) {
        const next = t(key, { workspace: "/tmp/w" }, { locale: "en" });
        expect(next, key).toContain("Settings → Governance");
        expect(next, key).toContain("first Root account");
      }
    });

    // The next-steps block above is only printed when the operator skips AI setup.
    // Everyone else ends on findMeLater, so the pointer has to be there as well.
    it("points the closing note at governance for an operator who connected AI", () => {
      const note = t("wizard.guided.findMeLater", undefined, { locale: "en" });
      expect(note).toContain("Settings → Governance");
      expect(note).toContain("first Root account");
    });
  });
});
