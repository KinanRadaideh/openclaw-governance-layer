import { definePage } from "@openclaw/uirouter";
import { html } from "lit";
import { routePageSpec } from "../../app-route-paths.ts";

export const page = definePage({
  ...routePageSpec("governance"),
  component: () =>
    import("./governance-page.ts").then(() => ({
      header: true,
      render: () => html`<openclaw-governance-page></openclaw-governance-page>`,
    })),
});
