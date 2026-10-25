import type { ToolResult } from "@writ/upstream";

/** What the agent reads when Writ, not the upstream, answers a call. */
const say = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

export const message = {
  unknownTool: (tool: string) =>
    say(`Writ has no tool named "${tool}". List the tools again; it may have been removed.`),

  blocked: (reason: string) =>
    say(
      `Writ blocked this call. ${reason} Don't retry it in another form; tell the user it was blocked.`,
    ),

  denied: (note: string | null) =>
    say(
      `A person denied this call in Writ.${note ? ` Their note: "${note}"` : ""} Don't retry it; ask the user what they want instead.`,
    ),

  waiting: (id: string) =>
    say(
      `This call is waiting for approval in Writ (request ${id}). Tell the user it needs their sign-off. Once it is approved, call this tool again with exactly the same arguments and it will run.`,
    ),

  expired: () =>
    say(
      "The approval request for this call expired before anyone decided. Ask the user before trying again.",
    ),

  alreadyUsed: () =>
    say(
      "This approval was already used for an earlier call. Call the tool again to ask for a new one.",
    ),

  upstreamFailed: (upstream: string, error: string) =>
    say(`The ${upstream} server failed to run this call: ${error}`),
};
