// Keys that alias an object's internals, rejected before anything is stored
// under them.
//
// The policy document keys several of its maps by a caller-supplied string:
// `agentMode`, `agentAsk`, `agentHitlTimeout` and `userAsk` are all plain
// objects whose keys arrive over HTTP. `__proto__` written into one of those
// either mutates the prototype chain or silently fails to persist, depending on
// how the object was constructed, and "silently fails to persist" is this
// project's worst outcome: a setting that reports success and does nothing.
//
// **Its own module rather than a helper inside `governance-dashboard-api.ts`,**
// for the reason `governance-dashboard-group.ts` gives about `requireGroup`:
// more than one route file needs it, and that file already imports all of them,
// so putting it there makes the dependency circular. It lives under
// `governance/` rather than `gateway/` because it is a fact about the policy
// document, not about HTTP.
export function isSafeObjectKey(value: string): boolean {
  return value !== "__proto__" && value !== "constructor" && value !== "prototype";
}
