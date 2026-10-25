# 2. Approvals hold the call open, with a retry handshake

**Status:** accepted

When a call needs approval, the gateway keeps the `tools/call` request open (sending progress
notifications when the client asked for them) until someone decides or the wait limit passes
(`WRIT_APPROVAL_WAIT_SECONDS`, default 120).

If the wait runs out, the agent gets an error result telling it the call is waiting for approval
and to call the tool again with the same arguments later. A repeated call from the same agent,
to the same tool, with the same arguments (compared by a hash of canonical JSON) attaches to the
existing pending or approved call instead of creating a new one. An approval is used once.

**Why:** agents and MCP clients differ in how long they wait. Holding the call open gives the
best experience when a person is at hand; the handshake makes long waits safe without any
client-specific support.

**Consequences:** approvals with edited arguments execute the edited arguments, even when the
agent retries with its original ones. A denial is final for that call; retrying creates a new
request.
