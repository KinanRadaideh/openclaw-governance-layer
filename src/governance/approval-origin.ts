// Which plugin approvals the governance gate raised (T86 D7, option A).
//
// Every escalation the gate asks a person about carries this as its `pluginId`, and an
// approval that carries it is governance's to route whatever channel started the run:
// hidden from Gateway connections, forwarded to no chat channel or phone, and answered on
// the governance dashboard by an account that manages the agent, which the record names.
// The stored approval keeps it too (`presentation.pluginId` is copied from the request).
// Before D7 only an escalation from a dashboard prompt was routed so (T68); a chat run's
// went to OpenClaw's own approval surfaces, where anyone with the channel or the Gateway
// credential could answer and the record could not say who.
export const GOVERNANCE_APPROVAL_PLUGIN_ID = "openclaw-governance";
