// The page's governance client: built from what the page holds, with its lag heard (T77).
// Its own module, so `api.ts` and `api.reply.ts` never import each other.
import { resolveControlUiAuthToken } from "../../app/control-ui-auth.ts";
import { GovernanceApi } from "./api.ts";

/** What the page holds that a client is built from: the base path and the Gateway's credentials. */
type GovernanceApiContext = {
  basePath: string;
  gateway: {
    snapshot?: { hello?: { auth?: { deviceToken?: string | null } | null } | null } | null;
    connection?: { token?: string | null; password?: string | null } | null;
  };
};

/** A client for the page, its credential resolved the Control UI's way, its lag heard by `onLag`. */
export function governanceApiFor(
  context: GovernanceApiContext,
  onLag: (reason: string) => void,
): GovernanceApi {
  const { gateway } = context;
  const token = resolveControlUiAuthToken({
    hello: gateway.snapshot?.hello ?? null,
    settings: { token: gateway.connection?.token ?? null },
    password: gateway.connection?.password ?? null,
  });
  return new GovernanceApi(context.basePath, token, onLag);
}
