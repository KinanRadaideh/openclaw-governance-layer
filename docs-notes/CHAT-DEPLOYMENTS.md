# Running the fork through Discord, Telegram, Slack or WhatsApp

The governance fork is a **hard fork of OpenClaw, not a replacement for it**.
Everything upstream OpenClaw can do, this fork still does, including being
reached through a chat channel. Setting up a channel is unchanged: follow
OpenClaw's own documentation (`docs/channels/discord.md`,
`docs/channels/telegram.md`, `docs/channels/slack.md`,
`docs/channels/whatsapp.md`). Nothing in this layer asks to be configured before
a channel works.

What this document covers is the part that is _not_ obvious: what the governance
layer does to a chat deployment, what an operator should expect to see, and what
it deliberately does not cover.

Verified by `src/governance/qa-round12.test.ts`, which drives the gate with
session keys built by the **host's own** `buildAgentPeerSessionKey`
(`src/routing/session-key.ts`) rather than strings this project invented. That
distinction is what the fifth QA round was about.

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
| Governance dashboard prompt        | `agent:<id>:governance:<account>`     |

All of them parse under `parseAgentSessionKey`, so the agent id is recovered in
every case. Round 12 asserts this for Discord, Slack, Telegram and WhatsApp
rather than assuming it, because if it were ever untrue the failure would be
silent and severe: on the deployment people actually use, the kill switch would
not fire, agent-scoped rules would not bind, and the ledger would attribute
nothing, while every other test in the suite stayed green.

**The agent must be registered.** Since M5 the gate refuses an agent it has no
record of (`agent-not-registered`), on a channel exactly as on the dashboard. An
agent a channel is bound to has to be registered to an organisation, by an
Administrator, before it can act. `docs-notes/FIRST-RUN.md` walks through it.

---

## 2. What an operator should expect

**The agent works on first boot.** The shipped baseline
(`docs-notes/BASELINE-RULES.md`) permits ordinary inspection work: reading files
in the workspace, listing directories, and a handful of read-only commands. So a
chat user asking the agent to look at something gets an answer immediately.
Writing files is not in the baseline. Round 12 checks that baseline work goes
through on a channel run and not only on a dashboard one.

**Anything outside the baseline asks a human.** The default posture is `enforce`
with `ask: on-miss`, so an unlisted command escalates rather than failing. The
escalation is handed to **OpenClaw's own approval machinery**, not to something
this project reimplemented. It is answered in the Control UI, and on Discord it
can render as Discord's native approval buttons (exec approvals,
`channels.discord.execApprovals` in `docs/channels/discord.md`). A chat user sees
the prompt they would see for any other OpenClaw approval, naming the agent and
the resource.

**A core denial is refused outright, with no button.** Credential files,
privilege escalation, host-destroying commands, the governance directory and the
cloud metadata endpoint are not approvable: offering "allow once" would let
anyone with access to the channel click past the tier that exists to be
unclickable. Root can switch five of those eight rules off (T24,
`docs-notes/BASELINE-RULES.md` §3); a rule that is off no longer refuses, so what
it covered falls through to the rules and then to a human like any other miss.
The three that protect the governance layer itself cannot be switched off.

### What "Always allow" does from a chat

The approval offers **Allow once**, **Always allow** and **Deny**. On a chat
deployment the person pressing a button holds no governance account and is
authenticated only by the chat platform, so what the middle button may do matters
most here.

- It **permits that one call**, exactly as **Allow once** does.
- It files **one rule request**, however many times the agent retries the same
  thing: scoped to that one agent, anchored to that exact resource, with the
  direction of access carried on it (finding 279).
- It writes **no rule**, changes no posture, and creates nothing an Administrator
  does not separately approve, signed in, on the dashboard's **Rule requests**
  section.
- The request is filed under `hitl-approval`, a **labelled origin** rather than
  an invented account, so the queue says that attribution is missing instead of
  answering the question wrongly.

The card says so in its own words: _"Always allow" allows this action once and
requests permission for future attempts. An Administrator must approve the
request before permission becomes permanent._ That sentence is part of the
escalation's description, so it travels with the approval into Discord or
Telegram.

**Why it works this way.** Until QA round 13 (finding 83) the middle button
called `addRule`, so a chat user's press wrote a permanent rule into the policy.
It was withdrawn for every surface, then re-opened by Kinan on 2026-09-06 with
the answer changed and the reasoning kept: one party asks, another grants. T60
(2026-09-11) added the explanation on the card. Requests filed this way share
**one budget for the organisation**, because they all carry that one labelled
origin: 40, plus 20 for every account.

### When nobody answers, or the run stops

**Nobody answering means denied.** An escalation times out after the approval
timeout (default 300 seconds, settable between 5 seconds and 24 hours
installation-wide, or per agent) and is denied. It then lands in **Awaiting your
decision** on the dashboard, so an operator can answer it properly later.
Answering **Would allow** files the same rule request **Always allow** does,
so the next attempt can succeed once an Administrator approves it (finding 338).
An unattended chat deployment therefore degrades towards _less_ access, never
towards more.

**A run that stops withdraws its question.** If the run ends while its approval
is waiting, the approval is closed as cancelled and its card goes away, rather
than staying answerable for a run that no longer exists (finding 363).

**The kill switch reaches a chat run.** A chat run is in the Gateway's own run
registry, so locking the agent aborts it and its waiting approval is withdrawn or
cancelled. While the agent is locked, every call it makes is refused, and so is
every call from an agent it started (T6). An approval can never let a locked
agent act: the host applies an allow without consulting policy again, which is
why the question is ended rather than left open (finding 364).

### Practical advice

- **Give each channel deployment its own agent id.** Rules, lockdown and the
  audit trail are all per agent, so one id per bot is what makes them useful.
- **Use monitor to learn the rules.** An Administrator puts one agent into
  `monitor` with **Observe one agent** in the **Policy** section; a User asks an
  Administrator to. Let people use the bot for a day, read the **Agent actions**
  view of the **Audit ledger** for what would have been refused, and add the
  legitimate ones as rules. Core denials and the kill switch still apply in
  monitor. This is what per-agent monitor was built for, and a chat deployment is
  its best case: real users generate real traffic faster than anyone can imagine
  it.
- **Raise the approval timeout if approvals are answered by a person in another
  timezone.** A User can set it for their own agents, an Administrator for any.
  For a bot that should never escalate, an Administrator can set that agent's
  **Ask a human on a miss** to off, so a miss is refused at once.

---

## 3. What the gate does not cover

Stated plainly, because a chat deployment makes some of them matter more than
they do anywhere else.

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
them as the _interface users interact through_, the recommended alternative to
exposing a port, not an egress to police.

What holds is that the attempt is **recorded as `ungoverned`** and attributed to
the agent, which is the same property that made the round-eleven coverage gaps
findable in the first place. Round 12 pins it, so it cannot silently become
`allow`.

**A chat user is not a governance account.** The four-tier role model governs
the dashboard. Somebody messaging the bot on Discord is authenticated by the
channel's own access controls (`docs/channels/access-groups.md`), not by a
governance role, and their messages are attributed to the agent rather than to a
named account. The one surface where a _person_ is recorded is the dashboard
prompt. Bridging channel identities to governance accounts is not built and is
not claimed.

**A failed request is not reported into the chat.** If **Always allow** is
pressed while the organisation's request budget is full, the action is still
allowed once and the ledger records the failed proposal, but the warning that
the request could not be saved is a follow-up only the Control UI shows. The
channel runtime settles each approval on its first resolved event and ignores the
second, so the person in the chat is told nothing. Anyone watching the dashboard
sees it.

**The helper-process gap (B1) is closed.** Until 2026-08-20 one configuration,
the native harness with the tool relay disabled, never reached the gate at all.
Governance now requires the relay on every installation
(`src/governance/native-relay-requirement.ts`). An agent that does run through
the Codex native harness is refused outright unless an Administrator has
permitted Codex for it, because on that backend a search's forbidden results can
be recorded but not withheld.

---

## 4. Where a chat deployment shows up in the dashboard

Nothing extra to configure. A channel-driven agent appears in the same places
as any other:

| Section                | What you see                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Active agent sessions  | The live run, with its channel visible in the session key                                                              |
| Audit ledger           | Every decision, attributed to the agent. The stored entry carries the session key; the dashboard row does not show it  |
| Awaiting your decision | Escalations from the chat that ended unanswered                                                                        |
| Rule requests          | Proposals from **Always allow** and **Would allow**, labelled `hitl-approval`, each showing what approving it would do |
| Your agents            | The dashboard's own conversation with that agent (separate from chat)                                                  |
| Emergency kill switch  | Stops the agent regardless of which channel started the run                                                            |

**Waiting for your answer** is not one of them. It shows the questions raised by
prompts sent from the dashboard, answered there by the accounts that manage the
agent (T68). A chat run's questions are answered in the Control UI or in the
channel.

The dashboard conversation and a chat conversation are **separate threads** with
the same agent, deliberately: they have different audiences, and merging them
would show a Discord channel what an operator typed privately. Round 12 asserts
the two session-key forms cannot collide.
