import { afterEach, describe, expect, test } from "bun:test";
import { schema } from "@writ/store";
import { eq } from "drizzle-orm";
import { type Harness, harness, ORIGIN, text } from "./test/harness";

let h: Harness;
afterEach(() => h?.close());

describe("agents connect with a token", () => {
  test("no token, a wrong token, or a revoked one is refused", async () => {
    h = await harness();
    const none = await h.app.request("/mcp", { method: "POST" });
    expect(none.status).toBe(401);
    await expect(h.connectAgent("writ_not-a-real-token")).rejects.toThrow();

    const { agent, token } = await h.addAgent("claude-code");
    const client = await h.connectAgent(token);
    await client.close();
    await h.consoleApi(`/agents/${agent.id}`, { method: "DELETE" });
    await expect(h.connectAgent(token)).rejects.toThrow();
  });

  test("the token is shown once and stored only as a hash", async () => {
    h = await harness();
    const { agent, token } = await h.addAgent("claude-code");
    expect(token).toStartWith("writ_");
    const list = await h.consoleApi("/agents");
    expect(JSON.stringify(list.json)).not.toContain(token);
    const [row] = await h.services.database.db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.id, agent.id));
    expect(row?.tokenHash).not.toContain(token.slice(5));
  });

  test("a browser on another origin can't reach /mcp", async () => {
    h = await harness();
    const res = await h.app.request("/mcp", {
      method: "POST",
      headers: { origin: "https://evil.test" },
    });
    expect(res.status).toBe(403);
  });
});

describe("tools", () => {
  test("agents see upstream tools renamed, with the effect Writ enforces", async () => {
    h = await harness();
    await h.addMailUpstream({ headers: { Authorization: "Bearer upstream-secret" } });
    const { token } = await h.addAgent("claude-code");
    const client = await h.connectAgent(token);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "mail__delete_all",
      "mail__list_inbox",
      "mail__send_email",
    ]);
    const del = tools.find((t) => t.name === "mail__delete_all")!;
    expect(del.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(del.description).toStartWith("[mail]");
    expect(h.upstream.lastAuth()).toBe("Bearer upstream-secret");
    await client.close();
  });

  test("upstream credentials are sealed and never returned", async () => {
    h = await harness();
    const created = await h.addMailUpstream({
      headers: { Authorization: "Bearer upstream-secret" },
    });
    expect(created.status).toBe(201);
    expect(created.json.upstream.headerNames).toEqual(["Authorization"]);
    expect(JSON.stringify(created.json)).not.toContain("upstream-secret");
    const [row] = await h.services.database.db.select().from(schema.upstreams);
    expect(row?.headers).not.toContain("upstream-secret");
  });
});

describe("the gate", () => {
  test("reads run straight through and are logged", async () => {
    h = await harness();
    await h.addMailUpstream();
    const { token } = await h.addAgent("claude-code");
    const client = await h.connectAgent(token);
    const res = await client.callTool({ name: "mail__list_inbox", arguments: {} });
    expect(text(res)).toContain("From mallory");
    const { json } = await h.consoleApi("/calls");
    expect(json.calls[0]).toMatchObject({
      agent: "claude-code",
      tool: "mail__list_inbox",
      upstream: "mail",
      status: "succeeded",
      decision: "allow",
    });
    await client.close();
  });

  test("a send waits for a person, who can edit it before approving", async () => {
    h = await harness();
    await h.addMailUpstream();
    const { token } = await h.addAgent("claude-code");
    const client = await h.connectAgent(token);
    const pendingCall = client.callTool({
      name: "mail__send_email",
      arguments: { to: "bob@acme.com", body: "hi bob" },
    });
    const call = await h.nextPending();
    expect(call.reason).toBe("Default for write tools.");
    expect(h.upstream.sent).toHaveLength(0);

    const approved = await h.consoleApi(`/calls/${call.id}/approve`, {
      method: "POST",
      json: { args: { to: "bob@acme.com", body: "Hi Bob, see you at 3." } },
    });
    expect(approved.json.call.decidedBy).toBe("Owner");
    expect(text(await pendingCall)).toBe("sent to bob@acme.com");
    expect(h.upstream.sent).toEqual([{ to: "bob@acme.com", body: "Hi Bob, see you at 3." }]);

    const again = await h.consoleApi(`/calls/${call.id}/approve`, { method: "POST", json: {} });
    expect(again.status).toBe(409);
    await client.close();
  });

  test("a denial reaches the agent with the person's note, and nothing is sent", async () => {
    h = await harness();
    await h.addMailUpstream();
    const { token } = await h.addAgent("claude-code");
    const client = await h.connectAgent(token);
    const pendingCall = client.callTool({
      name: "mail__send_email",
      arguments: { to: "eve@evil.test", body: "secrets" },
    });
    const call = await h.nextPending();
    await h.consoleApi(`/calls/${call.id}/deny`, { method: "POST", json: { note: "Not to her." } });
    const res = await pendingCall;
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('Their note: "Not to her."');
    expect(h.upstream.sent).toHaveLength(0);
    await client.close();
  });

  test("when nobody decides in time, a retry with the same arguments picks up the approval", async () => {
    h = await harness({ WRIT_APPROVAL_WAIT_SECONDS: "1" });
    await h.addMailUpstream();
    const { token } = await h.addAgent("claude-code");
    const client = await h.connectAgent(token);
    const args = { to: "bob@acme.com", body: "later" };

    const first = await client.callTool({ name: "mail__send_email", arguments: args });
    expect(text(first)).toContain("waiting for approval");
    const [pending] = (await h.consoleApi("/calls?status=pending")).json.calls;

    // The retry attaches to the same request instead of opening a second one.
    const second = await client.callTool({
      name: "mail__send_email",
      arguments: { body: "later", to: "bob@acme.com" },
    });
    expect(text(second)).toContain(pending.id);
    expect((await h.consoleApi("/calls?status=pending")).json.calls).toHaveLength(1);

    await h.consoleApi(`/calls/${pending.id}/approve`, { method: "POST", json: {} });
    expect(text(await client.callTool({ name: "mail__send_email", arguments: args }))).toBe(
      "sent to bob@acme.com",
    );
    // An approval is used once.
    const third = client.callTool({ name: "mail__send_email", arguments: args });
    const fresh = await h.nextPending();
    expect(fresh.id).not.toBe(pending.id);
    await h.consoleApi(`/calls/${fresh.id}/deny`, { method: "POST", json: {} });
    await third;
    expect(h.upstream.sent).toHaveLength(1);
    await client.close();
  });

  test("blocked calls never reach the upstream", async () => {
    h = await harness();
    await h.addMailUpstream();
    await h.consoleApi("/policy/rules", {
      method: "PUT",
      json: { rules: [{ tool: "*__delete_*", decision: "block", note: "No deletes, ever" }] },
    });
    const { token } = await h.addAgent("claude-code");
    const client = await h.connectAgent(token);
    const res = await client.callTool({ name: "mail__delete_all", arguments: {} });
    expect(text(res)).toContain("Blocked by No deletes, ever.");
    const { json } = await h.consoleApi("/calls");
    expect(json.calls[0].status).toBe("blocked");
    await client.close();
  });
});

describe("rules and taint", () => {
  test("rules can trust one agent and not another", async () => {
    h = await harness();
    await h.addMailUpstream();
    await h.consoleApi("/policy/rules", {
      method: "PUT",
      json: {
        rules: [
          {
            tool: "mail__send_email",
            agent: "support-*",
            decision: "allow",
            when: [{ path: "to", op: "endsWith", value: "@acme.com" }],
          },
        ],
      },
    });
    const support = await h.connectAgent((await h.addAgent("support-bot")).token);
    const args = { to: "bob@acme.com", body: "ok" };
    expect(text(await support.callTool({ name: "mail__send_email", arguments: args }))).toBe(
      "sent to bob@acme.com",
    );

    const other = await h.connectAgent((await h.addAgent("claude-code")).token);
    const waiting = other.callTool({ name: "mail__send_email", arguments: args });
    const call = await h.nextPending();
    await h.consoleApi(`/calls/${call.id}/deny`, { method: "POST", json: {} });
    await waiting;
    expect(h.upstream.sent).toHaveLength(1);
    await support.close();
    await other.close();
  });

  test("after reading untrusted content, even an allowed send needs a person", async () => {
    h = await harness();
    await h.addMailUpstream();
    await h.consoleApi("/policy/rules", {
      method: "PUT",
      json: { rules: [{ tool: "mail__*", decision: "allow" }] },
    });
    const client = await h.connectAgent((await h.addAgent("claude-code")).token);
    const args = { to: "mallory@evil.test", body: "the secrets" };

    // Before reading anything, the rule lets the send through.
    expect(
      text(
        await client.callTool({
          name: "mail__send_email",
          arguments: { ...args, to: "a@acme.com" },
        }),
      ),
    ).toBe("sent to a@acme.com");
    // The inbox carries a prompt injection. From here on the session is tainted.
    await client.callTool({ name: "mail__list_inbox", arguments: {} });
    const attempt = client.callTool({ name: "mail__send_email", arguments: args });
    const call = await h.nextPending();
    expect(call.reason).toContain("third-party content");
    await h.consoleApi(`/calls/${call.id}/deny`, { method: "POST", json: {} });
    await attempt;
    expect(h.upstream.sent.map((s) => s.to)).toEqual(["a@acme.com"]);

    // A fresh session starts clean.
    const fresh = await h.connectAgent((await h.addAgent("claude-code-2")).token);
    expect(
      text(
        await fresh.callTool({
          name: "mail__send_email",
          arguments: { ...args, to: "b@acme.com" },
        }),
      ),
    ).toBe("sent to b@acme.com");
    await client.close();
    await fresh.close();
  });

  test("a trusted upstream does not taint, strict mode taints everything", async () => {
    h = await harness();
    await h.addMailUpstream({ trusted: true });
    await h.consoleApi("/policy/rules", {
      method: "PUT",
      json: { rules: [{ tool: "mail__*", decision: "allow" }] },
    });
    const client = await h.connectAgent((await h.addAgent("claude-code")).token);
    await client.callTool({ name: "mail__list_inbox", arguments: {} });
    expect(
      text(
        await client.callTool({
          name: "mail__send_email",
          arguments: { to: "a@acme.com", body: "x" },
        }),
      ),
    ).toBe("sent to a@acme.com");

    await h.consoleApi("/policy/settings", { method: "PUT", json: { strictTaint: true } });
    const waiting = client.callTool({
      name: "mail__send_email",
      arguments: { to: "b@acme.com", body: "y" },
    });
    const call = await h.nextPending();
    await h.consoleApi(`/calls/${call.id}/deny`, { method: "POST", json: {} });
    await waiting;
    await client.close();
  });

  test("the policy tester explains a decision without making the call", async () => {
    h = await harness();
    await h.consoleApi("/policy/rules", {
      method: "PUT",
      json: {
        rules: [
          {
            tool: "github__merge_*",
            agent: "release-bot",
            decision: "allow",
            note: "Releases merge",
          },
        ],
      },
    });
    const test = (agent: string) =>
      h.consoleApi("/policy/test", {
        method: "POST",
        json: { tool: "github__merge_pr", agent, effect: "write" },
      });
    expect((await test("release-bot")).json.verdict).toMatchObject({
      decision: "allow",
      reason: "Decided by Releases merge.",
    });
    expect((await test("claude-code")).json.verdict.decision).toBe("ask");
    const bad = await h.consoleApi("/policy/rules", {
      method: "PUT",
      json: {
        rules: [{ tool: "x", decision: "allow", when: [{ path: "a", op: "matches", value: "(" }] }],
      },
    });
    expect(bad.status).toBe(422);
  });
});

describe("the console", () => {
  test("only the first account can sign up unless sign-up is open", async () => {
    h = await harness();
    expect((await h.app.request("/api/setup")).status).toBe(200);
    expect(await (await h.app.request("/api/setup")).json()).toEqual({
      needsOwner: false,
      signupOpen: false,
    });
    const res = await h.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({
        email: "eve@evil.test",
        password: "correct horse battery",
        name: "Eve",
      }),
    });
    expect(res.status).toBe(403);
    expect((await h.app.request("/api/calls")).status).toBe(401);
  });

  test("tool effects can be overridden per tool", async () => {
    h = await harness();
    const { json } = await h.addMailUpstream();
    expect(json.tools.find((t: { name: string }) => t.name === "delete_all").effect).toBe(
      "destructive",
    );
    await h.consoleApi(`/upstreams/${json.upstream.id}`, {
      method: "PATCH",
      json: { toolEffects: { send_email: "send" } },
    });
    const detail = await h.consoleApi(`/upstreams/${json.upstream.id}`);
    expect(detail.json.tools.find((t: { name: string }) => t.name === "send_email")).toMatchObject({
      effect: "send",
      overridden: true,
    });
  });
});
