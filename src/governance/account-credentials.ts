// Signing in and setting a password: the account store's credential half.
//
// Split from `user-store.ts` on 2026-10-10 (T77) to keep that file within its line limit. The
// store re-exports every function here, so callers and the tests that mock `authenticate` keep
// importing from `user-store.js`; this module imports nothing from it.
import { randomBytes } from "node:crypto";
import {
  authorityOf,
  briefSessionsReason,
  SessionMirrorError,
  type AuthorityChange,
} from "./account-authority.js";
import {
  ensureHomeDir,
  findUserByUsername,
  MIN_PASSWORD_LENGTH,
  PasswordTooShortError,
  readUsersFile,
  toRecord,
  type GovernanceUserRecord,
} from "./account-file.js";
import { ADMIN_ACTIONS, recordAdminAction, type AuditActorInput } from "./admin-audit.js";
import { withFileLock } from "./file-lock.js";
import { forgetLoginThrottle } from "./login-throttle.js";
import { hashPassword, needsRehash, verifyPassword } from "./password.js";
import { INSTALLATION_LEDGER_GROUP, usersFilePath } from "./paths.js";
import {
  applySessionAuthorityToToken,
  revokeSession,
  revokeSessionsForUser,
} from "./session-tokens.js";
import { writeGovernanceJson } from "./state-file.js";

/**
 * A syntactically valid scrypt hash of a value nobody can supply, used to burn
 * the same work when the username does not exist. Generated once per process.
 */
let decoyHashPromise: Promise<string> | undefined;

function decoyHash(): Promise<string> {
  decoyHashPromise ??= hashPassword(randomBytes(32).toString("hex"));
  return decoyHashPromise;
}

/**
 * Verifies credentials and returns the user record on success.
 *
 * When the username does not exist a password verification is still performed
 * against a decoy hash. Returning early instead would make the unknown-user
 * path measurably faster than the wrong-password path, letting an attacker
 * enumerate valid usernames by timing alone: the "broken authentication"
 * class OWASP calls out, and one the login throttle does not address because
 * a handful of probes per account is enough to learn existence.
 */
export async function authenticate(
  username: string,
  password: string,
): Promise<GovernanceUserRecord | undefined> {
  const user = await findUserByUsername(username);
  if (!user) {
    await verifyPassword(password, await decoyHash());
    return undefined;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return undefined;
  }
  // **An account with no group cannot sign in (M3).**
  //
  // Groups did not exist before M3, so accounts written earlier have none, and
  // nothing can infer which organisation they belonged to. Two options were
  // real: read absent as "the founding group", the way absent `actorRole` and
  // absent `canAuthorPolicy` are read; or refuse.
  //
  // Refusing is right *here* and the difference is what absence means. Those
  // other fields are properties whose default is knowable. A missing role is
  // "not recorded", a missing authoring flag is "allowed". A missing group is
  // not a default; it is an unanswered question about who this account belongs
  // to, and guessing it would silently place somebody in an organisation
  // nobody put them in. The refusal is deliberately after the password check,
  // so it says nothing to an attacker that a wrong password would not.
  //
  // The operator's way out was `governance groups migrate --delete`, which went with
  // the command line on 2026-09-07. Nothing calls `deleteUnmigratedAccounts` since,
  // so such an account stays until the file is edited by hand; only an installation
  // that held accounts before M3 can have one (recorded by the QA of 2026-09-14).
  if (!user.groupId) {
    return undefined;
  }
  // A successful sign-in is the only moment the plaintext exists, so it is the
  // only moment a stored hash can be strengthened without asking anybody to do
  // anything. Raising `CURRENT_SCRYPT_PARAMS` therefore migrates the
  // installation on its own, one login at a time, with no window in which
  // somebody is locked out. The property whose absence made the cost
  // effectively permanent (B9).
  const verifiedHash = needsRehash(user.passwordHash)
    ? await upgradeStoredPassword(user.id, user.passwordHash, password)
    : user.passwordHash;
  const record = toRecord(user);
  signInStamps.set(record, verifiedHash);
  return record;
}

/**
 * The stored hash each record `authenticate` returned was verified against, as it stood after
 * any upgrade (T77). Kept beside the record, not in it, so the hash never travels with an
 * account record; `confirmSignInSession` compares it with the account once the session exists.
 */
const signInStamps = new WeakMap<GovernanceUserRecord, string>();

/**
 * Confirms a session just issued for a sign-in, inside the accounts lock (T77).
 *
 * `authenticate` reads the account and the session is written afterwards, so a change can land in
 * between. T76 closed the deletion case here; this closes the rest: the account must still exist
 * and still hold the password that was verified (a reset in the gap signs the session out), and
 * the session is given the account's authority as it is now (a demotion in the gap demotes it).
 * Under the accounts lock, so a change mid-commit is either wholly before or wholly after. Returns
 * the account as it now is, or `undefined` after revoking the session.
 */
export async function confirmSignInSession(
  record: GovernanceUserRecord,
  token: string,
): Promise<GovernanceUserRecord | undefined> {
  await ensureHomeDir();
  const verifiedHash = signInStamps.get(record);
  return withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const current = file.users.find((u) => u.id === record.id);
    if (!current || verifiedHash === undefined || current.passwordHash !== verifiedHash) {
      await revokeSession(token);
      return undefined;
    }
    try {
      await applySessionAuthorityToToken(token, authorityOf(current));
    } catch (err) {
      // A session whose authority could not be confirmed is not handed out.
      await revokeSession(token).catch(() => undefined);
      throw err;
    }
    return toRecord(current);
  });
}

/**
 * Re-hashes one account's password at the current cost.
 *
 * Best-effort by design: a failure here must never turn a valid sign-in into a
 * failed one. The old hash still verifies, so the worst outcome is that the
 * upgrade is retried at the next login.
 *
 * The compare-and-swap on `passwordHash` matters because this runs outside the
 * caller's control flow: if the password changed between the read and this
 * write, a reset landing at the same moment, the stale value must not be
 * written back over the new one.
 */
async function upgradeStoredPassword(
  userId: string,
  expectedHash: string,
  password: string,
): Promise<string> {
  try {
    const rehashed = await hashPassword(password);
    return await withFileLock(usersFilePath(), async () => {
      const file = await readUsersFile();
      const user = file.users.find((u) => u.id === userId);
      if (!user || user.passwordHash !== expectedHash) {
        return expectedHash;
      }
      user.passwordHash = rehashed;
      await writeGovernanceJson(usersFilePath(), file);
      return rehashed;
    });
  } catch {
    // Deliberately swallowed; see above. The hash that was verified is still the stored one.
    return expectedHash;
  }
}

/**
 * Sets an account's password on behalf of Root.
 *
 * The recovery path whose absence made B9 severe: without it, a stored hash that
 * could not be verified, because the cost parameters moved, or the record was
 * corrupted, had no route back, since bootstrap refuses once any account
 * exists. Restricted to Root at the API boundary, like every other account
 * operation, and audited like one.
 */
export async function setUserPassword(
  userId: string,
  password: string,
  actor: AuditActorInput,
): Promise<AuthorityChange | false> {
  await ensureHomeDir();
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordTooShortError();
  }
  const hashed = await hashPassword(password);
  const changed = await withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const user = file.users.find((u) => u.id === userId);
    if (!user) {
      return undefined;
    }
    // T77, T76's order: every session is signed out inside this commit, before the new hash is
    // written. The route used to revoke them after, and a failure there left the old cookies,
    // perhaps the very ones the reset answers, working for up to twelve hours behind a 500.
    try {
      await revokeSessionsForUser(userId);
    } catch (err) {
      throw new SessionMirrorError(user.username, err);
    }
    user.passwordHash = hashed;
    await writeGovernanceJson(usersFilePath(), file);
    return { username: user.username, groupId: user.groupId };
  });
  if (!changed) {
    return false;
  }
  // A second sweep, for a session issued between the revocation and the write by a sign-in that
  // verified the old password; that sign-in's own recheck refuses it too (`confirmSignInSession`).
  let outcome: AuthorityChange = {};
  try {
    await revokeSessionsForUser(userId);
  } catch (err) {
    outcome = { sessionsError: briefSessionsReason(err) };
  }
  // **The failures go with the password they were counted against (finding 414).** A
  // person who forgot their password locks themselves out guessing; Root sets a new
  // one, and the lockout kept them out for up to fifteen minutes more. The guesses
  // were against a credential that no longer exists, and the new one starts with a
  // full allowance, so nothing the throttle defends is given up.
  forgetLoginThrottle(changed.username);
  await recordAdminAction(changed.groupId ?? INSTALLATION_LEDGER_GROUP, {
    actor,
    action: ADMIN_ACTIONS.userPasswordReset,
    // The password itself is never recorded, obviously. Only that it was
    // replaced, by whom, and for whom.
    target: `password reset for account ${changed.username}`,
    subjectId: userId,
  });
  return outcome;
}
