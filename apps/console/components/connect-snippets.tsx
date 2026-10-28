"use client";

import { useEffect, useState } from "react";
import { CopyBox, Segmented } from "./controls";

type Client = "claude" | "cursor" | "other";

/** How to point a client at Writ, with the agent's token filled in. */
export function ConnectSnippets({ token, agent }: { token: string; agent: string }) {
  const [client, setClient] = useState<Client>("claude");
  const [origin, setOrigin] = useState("http://localhost:3000");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/mcp`;

  const snippets: Record<Client, { value: string; note: string; multiline?: boolean }> = {
    claude: {
      value: `claude mcp add --transport http writ ${url} \\\n  --header "Authorization: Bearer ${token}"`,
      note: "Run in a terminal. Claude Code then sees your connected tools as mcp__writ__…",
      multiline: true,
    },
    cursor: {
      value: JSON.stringify(
        { mcpServers: { writ: { url, headers: { Authorization: `Bearer ${token}` } } } },
        null,
        2,
      ),
      note: "Add to ~/.cursor/mcp.json (or .cursor/mcp.json in a project).",
      multiline: true,
    },
    other: {
      value: `URL:    ${url}\nHeader: Authorization: Bearer ${token}`,
      note: `Any MCP client that speaks Streamable HTTP. Calls are logged as "${agent}".`,
      multiline: true,
    },
  };
  const s = snippets[client];
  return (
    <div className="space-y-2.5">
      <Segmented
        label="Client"
        value={client}
        onChange={setClient}
        options={[
          { value: "claude", label: "Claude Code" },
          { value: "cursor", label: "Cursor" },
          { value: "other", label: "Any client" },
        ]}
      />
      <CopyBox value={s.value} multiline={s.multiline ?? false} />
      <p className="text-[12px] text-fg-muted">{s.note}</p>
    </div>
  );
}
