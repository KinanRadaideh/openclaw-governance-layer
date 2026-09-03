# Running the fork through Discord, Telegram, Slack or WhatsApp

The governance fork is a **hard fork of OpenClaw, not a replacement for it**.
Everything upstream OpenClaw can do, this fork still does, including being
reached through a chat channel. Setting up a channel is unchanged: follow
OpenClaw's own documentation (`docs/channels/discord.md`,
`docs/channels/telegram.md`, and so on). Nothing in this layer asks to be
configured before a channel works.

What this document covers is the part that is _not_ obvious: what the governance
layer does to a chat deployment, what an operator should expect to see, and what
it deliberately does not cover.

Verified by `src/governance/qa-round12.test.ts`, which drives the gate with
session keys built by the **host's own** `buildAgentPeerSessionKey` rather than
strings this project invented. The distinction that the fifth QA round was
about.

---

## 1. Why it works at all

Every tool call in OpenClaw, whatever started it, funnels through
`runBeforeToolCallHook`, and the governance gate is attached there. A Discord
message and a dashboard prompt reach the same function by different routes, so
neither needs the gate to know about it.

The one thing the gate genuinely needs is **which agent is acting**, because
lockdown, agent-scoped rules and ledger attribution all key on it. On a channel
run the agent id is often absent from the hook context, and the gate recovers it
from the session key. The host builds those keys agent-scoped:

| Situation                          | Session key                           |
| ---------------------------------- | ------------------------------------- |
| Discord channel / Slack group      | `agent:<id>:discord:channel:<peerId>` |
| Telegram DM (default `main` scope) | `agent:<id>:main`                     |
| DM under a per-peer scope          | `agent:<id>:whatsapp:direct:<peerId>` |
| Governance dashboard (A1)          | `agent:<id>:governance:<account>`     |

All of them parse under `parseAgentSessionKey`, so the agent id is recovered in
every case. This is asserted per channel in round 12 rather than assumed,
because if it were ever untrue the failure would be silent and severe: on the
deployment people actually use, the kill switch would not fire, agent-scoped
rules would not bind, and the ledger would attribute nothing, while every other
test in the suite stayed green.

---

## 2. What an operator should expect

**The agent works on first boot.** The shipped baseline (see
`BASELINE-RULES.md`) permits ordinary inspection work, reading project files,
listing directories, a handful of read-only commands, so a chat user asking the
agent to look at something gets an answer immediately. This is the same property
the baseline was written for; round 12 checks it holds on a channel run and not
only in a dashboard one.

**Anything outside the baseline asks a human.** The default posture is `enforce`
with `ask: on-miss`, so an unlisted command escalates rather than failing. The
escalation is handed to **OpenClaw's own approval machinery**, not to something
this project reimplemented, which is why it renders as Discord's native
button-based approval (`docs/channels/discord.md`). A chat user sees the prompt
they would see for any other OpenClaw approval.

**A core denial is refused outright, with no button.** Credential files,
privilege escalation, the governance directory and the cloud metadata endpoint
are not approvable: offering "allow once" would let anyone with access to the
channel click past the tier that exists to be unclickable.

> **Closed in QA round 13 (finding 83): the escalation offers two buttons,
> `allow-once` and `deny`.** It used to offer a third, `allow-always`, and
> `onResolution` called `addRule`, so the middle button **wrote a permanent
> rule into `policy.json`**, scoped to the agent and attributed to
> `hitl-approval`. The person clicking it holds no
> governance account, is not any of the four tiers, and is authenticated only by
> the chat platform's own access controls. §5 of this document is right that a
> chat user is not a governance account; what it does not say is that one of the
> buttons they are shown creates governance state that outlives the
> conversation.
>
> `allow-always` was withdrawn for **every** surface rather than only for
> channel-originated turns. Simpler, and better: it removes policy authorship
> from the escalation path entirely, and the per-channel version would have
> needed the turn source plumbed into the engine for a distinction that does
> not really hold. The dashboard's approval machinery reports a decision
> without an identity too.
>
> Nothing is lost operationally. `allow-once` still unblocks the agent with no
> delay, and an escalation that goes unanswered still lands on the
> pending-decision stack for an operator to answer properly. What changed is
> that making a grant _permanent_ now happens on a surface that knows who is
> asking. The callback also refuses to write a rule even if the host's approval
> machinery, a separate component with its own view of what it may send,
> hands it the withdrawn decision anyway.

**Nobody answering means denied.** An escalation times out after
`hitlTimeoutSeconds` (default 300) and is denied, then pushed onto the
pending-decision stack so an operator can answer it later from the dashboard.
An unattended chat deployment therefore degrades towards _less_ access, never
towards more.

### Practical advice

- **Give each channel deployment its own agent id.** Rules, lockdown and the
  audit trail are all per agent, so one id per bot is what makes them useful.
- **Use monitor mode to learn the rules.** Point `governance policy
set-agent-mode <agentId> monitor` at a new bot, let people use it for a day,
  then read the `deny` and `ask` entries out of the ledger and promote the
  legitimate ones. This is what per-agent monitor was built for and a chat
  deployment is its best case: real users generate real traffic faster than
  anyone can imagine it.
- **Raise the escalation window if approvals are answered by a person on
  another timezone**, or lower `ask` to `off` for a bot that should never
  escalate.

---

## 3. What the gate does not cover

Stated plainly, because a chat deployment makes one of them matter more than it
does anywhere else.

**Outbound messages are ungoverned.** The policy language has three resource
kinds, command, path, network, and none of them describes "post this text into
a Discord channel". An agent that legitimately reads a permitted file can repeat
its contents into chat, and no rule is consulted.

This is deliberate rather than an oversight, and as of 2026-08-26 it is
**settled rather than pending** (T8). Two reasons, and the second is the one
that closes it.

**The reply is the product.** Refusing `message` by default would stop the agent
answering the person who asked it something, so the fork would be broken over
chat.

**And connecting the agent is itself the permission.** Attaching an agent to a
Discord server or a Telegram chat is an operator deciding it should speak there.
A gate that then refused would be overriding the grant it was handed. The
specification agrees: §1.3 names three resource categories and messaging is not
one of them, while the one place it mentions chat platforms (§2.1.1.3) casts
them as the _interface users interact through_. The recommended alternative to
exposing a port, not an egress to police.

So this is no longer listed as future work. It was carried as "needs a fourth
resource kind" for months, which read as a gap; it is a boundary.

What holds today is that the attempt is **recorded as `ungoverned`** and
attributed to the agent, which is the same property that made the round-eleven
coverage gaps findable in the first place. Round 12 pins it, so it cannot
silently become `allow`.

**The harness bypass (B1) applies here too.** One configuration, the native
(Codex) harness, plugin-free, with loop-detection relay disabled, never enters
`runBeforeToolCallHook` at all. In-process sessions, which is every
configuration used so far, are unaffected. See `mg/REMAINING-WORK.md` §B1.

**A chat user is not a governance account.** The four-tier RBAC governs the
dashboard. Somebody messaging the bot on Discord is authenticated by the
channel's own access controls (`docs/channels/access-groups.md`), not by a
governance role, and their messages are attributed to the agent rather than to a
named account. The one surface where a _person_ is recorded is the dashboard
prompt path (A1). Bridging channel identities to governance accounts is not
built and is not claimed.

---

## 4. Where a chat deployment shows up in the dashboard

Nothing extra to configure. A channel-driven agent appears in the same places
as any other:

| Panel                 | What you see                                                          |
| --------------------- | --------------------------------------------------------------------- |
| Active agent sessions | The live run, with its channel visible in the session key             |
| Audit ledger          | Every decision, with the channel in the session key column            |
| Your agents           | The dashboard's own conversation with that agent (separate from chat) |
| Kill switch           | Stops the agent regardless of which channel started the run           |

The dashboard conversation and a chat conversation are **separate threads** with
the same agent, deliberately: they have different audiences, and merging them
would show a Discord channel what an operator typed privately. Round 12 asserts
the two session-key forms cannot collide.
