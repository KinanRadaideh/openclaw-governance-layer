// Who is running a governance command (T5).
//
// ## The gap this closes
//
// Every command-line change was recorded against the literal actor `cli`. The
// audit trail could say *a change was made from this machine* and never *by
// whom*, which is half of what an administrative trail is for, and the half a
// panel asks about first. It was recorded as limitation A6 and described there
// as an attribution problem, which understated it: with no identity there was
// also no authorization, so the command line ignored the tier model entirely.
// A Viewer with shell access could add rules that the dashboard would have
// refused them.
//
// ## What this does and does not claim
//
// **It closes attribution.** A signed-in operator's name and tier land in the
// ledger exactly as they do from the dashboard, through the same
// `recordAdminAction` path.
//
// **It also enforces**, using the same permission helpers the HTTP routes use,
// so the two surfaces cannot drift into different answers about who may do
// what.
//
// **It does not make the command line a security boundary, and the report must
// not say it does.** Anyone who can run these commands can read and write the
// governance directory directly, `policy.json`, `users.json`, the ledger, and
// no login can change that. What this buys is a real control against mistakes
// and casual misuse, an honest trail of who did what, and consistency between
// surfaces. What it does not buy is protection from a determined local
// attacker, whose boundary remains the filesystem's.
//
// That distinction is why `requireCliActor` refuses rather than warns: an
// operator who is told "you are not permitted" and can still edit the file has
// been told the truth about the control, not offered a false one.
import { readFile, rm, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import type { AuditActorInput } from "./admin-audit.js";
import { cliSessionFilePath, governanceHomeDir } from "./paths.js";
import type { GovernanceActor } from "./permissions.js";
import type { GovernanceRole } from "./roles.js";
import { revokeSession, verifySession } from "./session-tokens.js";

type StoredCliSession = { version: 1; token: string };

/** Remembers a signed-in operator between commands. */
export async function storeCliSession(token: string): Promise<void> {
  await mkdir(governanceHomeDir(), { recursive: true, mode: 0o700 });
  const payload: StoredCliSession = { version: 1, token };
  // `0600` for the same reason every other governance file is: the token is a
  // bearer credential, and a readable one is an account anybody on the host can
  // borrow.
  await writeFile(cliSessionFilePath(), JSON.stringify(payload), { mode: 0o600 });
}

export async function clearCliSession(): Promise<string | undefined> {
  const token = await readStoredToken();
  await rm(cliSessionFilePath(), { force: true });
  return token;
}

async function readStoredToken(): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(await readFile(cliSessionFilePath(), "utf8")) as StoredCliSession;
    return typeof parsed?.token === "string" && parsed.token ? parsed.token : undefined;
  } catch {
    return undefined;
  }
}

export type CliIdentity = {
  username: string;
  role: GovernanceRole;
  assignedAgents: string[];
  canAuthorPolicy?: boolean;
  /**
   * The account id and the group it acts inside, carried from the session (M4).
   *
   * Neither was needed while every command-line act was either installation-wide
   * or scoped by assignment. The agent registry needs both: the group bounds
   * what the operator can see at all, and the id answers "is this my agent?",
   * which is the question that decides whether they may rename, re-own or
   * unregister it. Resolving those from the username instead would be a second
   * lookup that could disagree with the session: and a session is already the
   * one place both facts are authoritative.
   *
   * Optional because a session issued before M3 carries no group. That session
   * belongs to an account that can no longer sign in, so it holds nothing and
   * the registry answers it with an empty list rather than an error.
   */
  userId: string;
  groupId?: string;
};

/**
 * The signed-in operator, or undefined when nobody is.
 *
 * Resolved through `verifySession` rather than by trusting the stored file, so
 * an expired or revoked session stops working on the command line at the same
 * moment it stops working in the browser. A token file that outlived its
 * session would be a way to keep authority after being signed out.
 */
export async function currentCliIdentity(): Promise<CliIdentity | undefined> {
  const token = await readStoredToken();
  if (!token) {
    return undefined;
  }
  const session = await verifySession(token);
  if (!session) {
    return undefined;
  }
  return {
    username: session.username,
    role: session.role,
    assignedAgents: session.assignedAgents,
    userId: session.userId,
    ...(session.canAuthorPolicy !== undefined ? { canAuthorPolicy: session.canAuthorPolicy } : {}),
    ...(session.groupId ? { groupId: session.groupId } : {}),
  };
}

/** Ends the stored session on the server as well as on disk. */
export async function signOutCli(): Promise<void> {
  const token = await clearCliSession();
  if (token) {
    // Revoked, not merely forgotten. Deleting the local file alone would leave
    // a live session that anyone holding a copy of the token could still use.
    await revokeSession(token);
  }
}

/** The permission-helper shape, so CLI and HTTP ask the same questions. */
export function toCliActor(identity: CliIdentity): GovernanceActor {
  return {
    username: identity.username,
    role: identity.role,
    assignedAgents: identity.assignedAgents,
    ...(identity.canAuthorPolicy !== undefined
      ? { canAuthorPolicy: identity.canAuthorPolicy }
      : {}),
  };
}

/** The audit-actor shape, carrying the tier the action was taken under. */
export function toCliAuditActor(identity: CliIdentity): AuditActorInput {
  return { name: identity.username, role: identity.role };
}

/** Raised when a command needs an identity and none is signed in. */
export class NotSignedInError extends Error {
  constructor() {
    super("Not signed in. Run `openclaw governance login` first.");
    this.name = "NotSignedInError";
  }
}

/** Raised when the signed-in operator's tier does not permit the command. */
export class CliPermissionError extends Error {
  constructor(what: string) {
    super(`Your account is not permitted to ${what}.`);
    this.name = "CliPermissionError";
  }
}
