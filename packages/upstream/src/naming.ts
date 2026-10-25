import type { Effect } from "@writ/policy";

/** Upstream and agent names: lowercase letters, digits and single dashes. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SEPARATOR = "__";

/**
 * The tool name agents see: `<upstream>__<tool>`. Slugs never contain `_`, so the separator
 * is unambiguous and one upstream can't shadow another's tools. Capped at 64 characters, the
 * limit most model APIs put on tool names.
 */
export function exposedName(upstream: string, tool: string): string {
  const safe = tool.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${upstream}${SEPARATOR}${safe}`.slice(0, 64);
}

export function upstreamOf(exposed: string): string | null {
  const i = exposed.indexOf(SEPARATOR);
  return i > 0 ? exposed.slice(0, i) : null;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  title?: string;
}

/**
 * A tool's effect. An admin's override wins. Otherwise MCP annotations decide, read the way
 * the spec intends: a tool that doesn't say it is read-only may change things, and one that
 * doesn't say it is non-destructive may destroy them. Annotations are claims made by the
 * server, which is why overrides exist.
 */
export function effectOf(
  tool: { name: string; annotations?: ToolAnnotations },
  overrides: Record<string, Effect>,
): Effect {
  const override = overrides[tool.name];
  if (override) return override;
  if (tool.annotations?.readOnlyHint === true) return "read";
  if (tool.annotations?.destructiveHint === false) return "write";
  return "destructive";
}
