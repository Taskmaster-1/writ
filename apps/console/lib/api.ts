/** Shapes returned by the gateway's console API (`apps/gateway/src/api`). */

export type Effect = "read" | "write" | "send" | "destructive";
export type Decision = "allow" | "ask" | "block";
export type CallStatus =
  | "pending"
  | "approved"
  | "denied"
  | "blocked"
  | "expired"
  | "running"
  | "succeeded"
  | "failed";

export interface Call {
  id: string;
  agent: string;
  agentId: string;
  sessionId: string | null;
  tool: string;
  upstream: string | null;
  effect: Effect;
  args: Record<string, unknown>;
  approvedArgs: Record<string, unknown> | null;
  decision: Decision;
  reason: string;
  tainted: boolean;
  status: CallStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  output: string | null;
  isError: boolean;
  durationMs: number | null;
  expiresAt: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  tokenHint: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface Upstream {
  id: string;
  name: string;
  url: string;
  headerNames: string[];
  trusted: boolean;
  enabled: boolean;
  toolEffects: Record<string, Effect>;
  status: "ok" | "error" | "unknown";
  lastError: string | null;
  createdAt: string;
}

export interface UpstreamTool {
  name: string;
  exposed: string;
  title: string | null;
  description: string | null;
  effect: Effect;
  overridden: boolean;
}

export type MatcherOp =
  | "equals"
  | "notEquals"
  | "in"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "allEndWith"
  | "matches"
  | "exists";

export interface Matcher {
  path: string;
  op: MatcherOp;
  value?: unknown;
}

export interface Rule {
  tool: string;
  agent?: string | null;
  decision: Decision;
  when?: Matcher[] | null;
  note?: string | null;
}

export interface Policy {
  rules: (Rule & { id: string })[];
  defaults: Record<Effect, Decision>;
  strictTaint: boolean;
}

export interface Verdict {
  decision: Decision;
  reason: string;
  ruleId: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, "network", "Can't reach the Writ gateway.");
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: { code: string; message: string } })
    | null;
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/me" && typeof window !== "undefined")
      window.location.href = "/sign-in";
    throw new ApiError(
      res.status,
      data?.error?.code ?? "error",
      data?.error?.message ??
        (data as { message?: string } | null)?.message ??
        `Request failed (${res.status})`,
    );
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  setup: () => request<{ needsOwner: boolean; signupOpen: boolean }>("GET", "/api/setup"),
  me: () => request<{ user: { id: string; name: string; email: string } }>("GET", "/api/me"),
  signIn: (email: string, password: string) =>
    request("POST", "/api/auth/sign-in/email", { email, password }),
  signUp: (name: string, email: string, password: string) =>
    request("POST", "/api/auth/sign-up/email", { name, email, password }),
  signOut: () => request("POST", "/api/auth/sign-out", {}),

  calls: (q: { status?: CallStatus[]; agent?: string; before?: string; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (q.status?.length) p.set("status", q.status.join(","));
    if (q.agent) p.set("agent", q.agent);
    if (q.before) p.set("before", q.before);
    if (q.limit) p.set("limit", String(q.limit));
    return request<{ calls: Call[] }>("GET", `/api/calls?${p}`);
  },
  summary: () =>
    request<{ pending: number; last24h: Partial<Record<CallStatus, number>> }>(
      "GET",
      "/api/calls/summary",
    ),
  approve: (id: string, body: { note?: string; args?: Record<string, unknown> } = {}) =>
    request<{ call: Call }>("POST", `/api/calls/${enc(id)}/approve`, body),
  deny: (id: string, note?: string) =>
    request<{ call: Call }>("POST", `/api/calls/${enc(id)}/deny`, note ? { note } : {}),

  agents: () => request<{ agents: Agent[] }>("GET", "/api/agents"),
  createAgent: (body: { name: string; description?: string }) =>
    request<{ agent: Agent; token: string }>("POST", "/api/agents", body),
  rotateAgent: (id: string) =>
    request<{ agent: Agent; token: string }>("POST", `/api/agents/${enc(id)}/rotate`, {}),
  revokeAgent: (id: string) => request<{ agent: Agent }>("DELETE", `/api/agents/${enc(id)}`),

  upstreams: () => request<{ upstreams: Upstream[] }>("GET", "/api/upstreams"),
  upstream: (id: string, fresh = false) =>
    request<{ upstream: Upstream; tools: UpstreamTool[]; error: string | null }>(
      "GET",
      `/api/upstreams/${enc(id)}${fresh ? "?fresh=1" : ""}`,
    ),
  addUpstream: (body: {
    name: string;
    url: string;
    headers?: Record<string, string>;
    trusted?: boolean;
  }) =>
    request<{ upstream: Upstream; tools: UpstreamTool[]; error: string | null }>(
      "POST",
      "/api/upstreams",
      body,
    ),
  updateUpstream: (
    id: string,
    body: Partial<{
      url: string;
      headers: Record<string, string>;
      trusted: boolean;
      enabled: boolean;
      toolEffects: Record<string, Effect>;
    }>,
  ) => request<{ upstream: Upstream }>("PATCH", `/api/upstreams/${enc(id)}`, body),
  removeUpstream: (id: string) => request<void>("DELETE", `/api/upstreams/${enc(id)}`),

  policy: () => request<Policy>("GET", "/api/policy"),
  saveRules: (rules: Rule[]) => request<Policy>("PUT", "/api/policy/rules", { rules }),
  saveSettings: (body: { defaults?: Partial<Record<Effect, Decision>>; strictTaint?: boolean }) =>
    request<Policy>("PUT", "/api/policy/settings", body),
  testPolicy: (body: {
    tool: string;
    agent: string;
    effect: Effect;
    args?: Record<string, unknown>;
    tainted?: boolean;
  }) => request<{ verdict: Verdict }>("POST", "/api/policy/test", body),
};

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
