import { globMatch } from "./glob";
import { matches } from "./matchers";
import type { CallFacts, Defaults, Rule, Verdict } from "./types";

function applies(rule: Rule, call: CallFacts): boolean {
  if (!globMatch(rule.tool, call.tool)) return false;
  if (rule.agent && !globMatch(rule.agent, call.agent)) return false;
  return (rule.when ?? []).every((m) => matches(call.args, m));
}

function describe(rule: Rule): string {
  return rule.note?.trim() || `rule "${rule.tool}${rule.agent ? ` for ${rule.agent}` : ""}"`;
}

/**
 * Decides one call. A matching `block` rule always wins; otherwise the first matching rule;
 * otherwise the default for the tool's effect. In a tainted session nothing but reads is
 * allowed without a person, whatever the rules say.
 */
export function evaluate(call: CallFacts, rules: readonly Rule[], defaults: Defaults): Verdict {
  const matching = rules.filter((r) => applies(r, call));
  const blocker = matching.find((r) => r.decision === "block");
  if (blocker)
    return { decision: "block", reason: `Blocked by ${describe(blocker)}.`, ruleId: blocker.id };

  const first = matching[0];
  const verdict: Verdict = first
    ? { decision: first.decision, reason: `Decided by ${describe(first)}.`, ruleId: first.id }
    : {
        decision: defaults[call.effect],
        reason: `Default for ${call.effect} tools.`,
        ruleId: null,
      };

  if (call.tainted && call.effect !== "read" && verdict.decision === "allow") {
    return {
      decision: "ask",
      reason:
        "This session has read third-party content, so actions that change things need a person.",
      ruleId: verdict.ruleId,
    };
  }
  return verdict;
}
