import {
  DEFAULTS,
  type Decision,
  EFFECTS,
  type Effect,
  evaluate,
  type Rule,
  validateMatcher,
} from "@writ/policy";
import { schema } from "@writ/store";
import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, fail, readBody } from "../http";

const DecisionSchema = z.enum(["allow", "ask", "block"] as [Decision, ...Decision[]]);
const EffectSchema = z.enum(EFFECTS as [Effect, ...Effect[]]);

const MatcherSchema = z.object({
  path: z.string().trim().min(1).max(200),
  op: z.enum([
    "equals",
    "notEquals",
    "in",
    "contains",
    "startsWith",
    "endsWith",
    "allEndWith",
    "matches",
    "exists",
  ]),
  value: z.unknown().optional(),
});

const RuleSchema = z.object({
  tool: z.string().trim().min(1).max(200),
  agent: z.string().trim().max(100).nullish(),
  decision: DecisionSchema,
  when: z.array(MatcherSchema).max(20).nullish(),
  note: z.string().trim().max(200).nullish(),
});

const SettingsSchema = z.object({
  defaults: z.record(EffectSchema, DecisionSchema).optional(),
  strictTaint: z.boolean().optional(),
});

async function load(c: { var: AppEnv["Variables"] }) {
  const { db } = c.var.services.database;
  const rules = await db.select().from(schema.rules).orderBy(asc(schema.rules.position));
  const [settings] = await db.select().from(schema.settings);
  return {
    rules,
    defaults: settings?.defaults ?? DEFAULTS,
    strictTaint: settings?.strictTaint ?? false,
  };
}

/** Rules, defaults and strict mode. Rules are saved as a whole ordered list. */
export const policy = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await load(c)))

  .put("/rules", async (c) => {
    const { rules } = await readBody(c, z.object({ rules: z.array(RuleSchema).max(500) }));
    for (const [i, rule] of rules.entries())
      for (const m of rule.when ?? []) {
        const problem = validateMatcher(m);
        if (problem) fail(422, "invalid_rule", `Rule ${i + 1}: ${problem}`);
      }
    const { db } = c.var.services.database;
    await db.transaction(async (tx) => {
      await tx.delete(schema.rules);
      if (rules.length)
        await tx.insert(schema.rules).values(
          rules.map((r, position) => ({
            position,
            tool: r.tool,
            agent: r.agent || null,
            decision: r.decision,
            when: r.when?.length ? r.when : null,
            note: r.note || null,
          })),
        );
    });
    return c.json(await load(c));
  })

  .put("/settings", async (c) => {
    const input = await readBody(c, SettingsSchema);
    const current = await load(c);
    const values = {
      id: "default",
      defaults: { ...current.defaults, ...input.defaults },
      strictTaint: input.strictTaint ?? current.strictTaint,
    };
    await c.var.services.database.db
      .insert(schema.settings)
      .values(values)
      .onConflictDoUpdate({ target: schema.settings.id, set: values });
    return c.json(await load(c));
  })

  /** What the current policy would do with a call, without making it. */
  .post("/test", async (c) => {
    const input = await readBody(
      c,
      z.object({
        tool: z.string().min(1),
        agent: z.string().min(1),
        effect: EffectSchema,
        args: z.record(z.string(), z.unknown()).default({}),
        tainted: z.boolean().default(false),
      }),
    );
    const { rules, defaults, strictTaint } = await load(c);
    return c.json({
      verdict: evaluate(
        { ...input, tainted: input.tainted || strictTaint },
        rules as Rule[],
        defaults,
      ),
    });
  });
