import { describe, expect, test } from "bun:test";
import { evaluate } from "./evaluate";
import { globMatch } from "./glob";
import { matches, validateMatcher } from "./matchers";
import { type CallFacts, DEFAULTS, type Rule } from "./types";

const call = (over: Partial<CallFacts> = {}): CallFacts => ({
  tool: "github__create_issue",
  agent: "claude-code",
  effect: "write",
  args: {},
  tainted: false,
  ...over,
});

describe("defaults", () => {
  test("reads run, everything else asks", () => {
    expect(evaluate(call({ effect: "read" }), [], DEFAULTS).decision).toBe("allow");
    for (const effect of ["write", "send", "destructive"] as const)
      expect(evaluate(call({ effect }), [], DEFAULTS).decision).toBe("ask");
  });

  test("a verdict from a default names the effect and no rule", () => {
    expect(evaluate(call(), [], DEFAULTS)).toEqual({
      decision: "ask",
      reason: "Default for write tools.",
      ruleId: null,
    });
  });
});

describe("rules", () => {
  const allowSandbox: Rule = {
    id: "sandbox",
    tool: "github__*",
    decision: "allow",
    when: [{ path: "repo", op: "startsWith", value: "acme/sandbox" }],
  };

  test("the first matching rule decides", () => {
    const rules: Rule[] = [allowSandbox, { id: "all", tool: "github__*", decision: "ask" }];
    expect(evaluate(call({ args: { repo: "acme/sandbox-1" } }), rules, DEFAULTS).ruleId).toBe(
      "sandbox",
    );
    expect(evaluate(call({ args: { repo: "acme/web" } }), rules, DEFAULTS).ruleId).toBe("all");
  });

  test("a block anywhere wins over an earlier allow", () => {
    const rules: Rule[] = [
      allowSandbox,
      { id: "no-deletes", tool: "*delete*", decision: "block", note: "Never delete" },
    ];
    const v = evaluate(
      call({ tool: "github__delete_repo", args: { repo: "acme/sandbox" } }),
      rules,
      DEFAULTS,
    );
    expect(v).toEqual({
      decision: "block",
      reason: "Blocked by Never delete.",
      ruleId: "no-deletes",
    });
  });

  test("rules can be scoped to agents", () => {
    const rules: Rule[] = [
      { id: "bot-merges", tool: "github__merge_*", agent: "release-*", decision: "allow" },
    ];
    const merge = { tool: "github__merge_pull_request" };
    expect(evaluate(call({ ...merge, agent: "release-bot" }), rules, DEFAULTS).decision).toBe(
      "allow",
    );
    expect(evaluate(call({ ...merge, agent: "claude-code" }), rules, DEFAULTS).decision).toBe(
      "ask",
    );
  });
});

describe("taint", () => {
  const allowAll: Rule[] = [{ id: "yolo", tool: "*", decision: "allow" }];

  test("a tainted session can't auto-allow anything but reads", () => {
    const v = evaluate(call({ effect: "send", tainted: true }), allowAll, DEFAULTS);
    expect(v.decision).toBe("ask");
    expect(v.ruleId).toBe("yolo");
    expect(evaluate(call({ effect: "read", tainted: true }), allowAll, DEFAULTS).decision).toBe(
      "allow",
    );
  });

  test("taint never weakens a block", () => {
    const rules: Rule[] = [{ id: "b", tool: "*", decision: "block" }];
    expect(evaluate(call({ tainted: true }), rules, DEFAULTS).decision).toBe("block");
  });
});

describe("matchers", () => {
  const args = { to: ["a@acme.com", "b@ACME.com"], repo: "acme/web", n: 3, nested: { x: "y" } };

  test("string tests on arrays need every element to pass", () => {
    expect(matches(args, { path: "to", op: "allEndWith", value: ["@acme.com"] })).toBe(true);
    expect(
      matches(
        { to: ["a@acme.com", "eve@evil.test"] },
        { path: "to", op: "allEndWith", value: "@acme.com" },
      ),
    ).toBe(false);
    expect(matches({ to: [] }, { path: "to", op: "allEndWith", value: "@acme.com" })).toBe(false);
  });

  test("paths, equality, membership and patterns", () => {
    expect(matches(args, { path: "nested.x", op: "equals", value: "y" })).toBe(true);
    expect(matches(args, { path: "n", op: "in", value: [1, 2, 3] })).toBe(true);
    expect(matches(args, { path: "to", op: "contains", value: "a@acme.com" })).toBe(true);
    expect(matches(args, { path: "repo", op: "matches", value: "^acme/" })).toBe(true);
    expect(matches(args, { path: "missing", op: "exists" })).toBe(false);
    expect(matches(args, { path: "repo", op: "matches", value: "(" })).toBe(false);
  });

  test("validation explains bad conditions", () => {
    expect(validateMatcher({ path: "", op: "exists" })).toContain("path");
    expect(validateMatcher({ path: "a", op: "equals" })).toContain("needs a value");
    expect(validateMatcher({ path: "a", op: "matches", value: "(" })).toContain(
      "regular expression",
    );
    expect(validateMatcher({ path: "a", op: "exists" })).toBeNull();
  });
});

test("globs are literal apart from *", () => {
  expect(globMatch("github__*", "github__create_issue")).toBe(true);
  expect(globMatch("*__delete_*", "linear__delete_issue")).toBe(true);
  expect(globMatch("a.b", "aXb")).toBe(false);
  expect(globMatch("GitHub__*", "github__x")).toBe(false);
});
