import { schema } from "@writ/store";
import { SLUG } from "@writ/upstream";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { newToken } from "../agents/tokens";
import { type AppEnv, fail, readBody } from "../http";

const Create = z.object({
  name: z.string().trim().toLowerCase().max(40).regex(SLUG, "lowercase letters, digits and dashes"),
  description: z.string().trim().max(200).optional(),
});

const view = (a: typeof schema.agents.$inferSelect) => ({
  id: a.id,
  name: a.name,
  description: a.description,
  tokenHint: a.tokenHint,
  lastSeenAt: a.lastSeenAt,
  revokedAt: a.revokedAt,
  createdAt: a.createdAt,
});

/** Agents and their tokens. A token is shown once, when it is created or rotated. */
export const agents = (onRevoke: (agentId: string) => void) =>
  new Hono<AppEnv>()
    .get("/", async (c) => {
      const rows = await c.var.services.database.db
        .select()
        .from(schema.agents)
        .orderBy(desc(schema.agents.createdAt));
      return c.json({ agents: rows.map(view) });
    })

    .post("/", async (c) => {
      const input = await readBody(c, Create);
      const { db } = c.var.services.database;
      const [taken] = await db
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .where(eq(schema.agents.name, input.name));
      if (taken) fail(409, "conflict", `An agent named "${input.name}" already exists.`);
      const { token, hash, hint } = newToken();
      const [agent] = await db
        .insert(schema.agents)
        .values({
          name: input.name,
          description: input.description || null,
          tokenHash: hash,
          tokenHint: hint,
          createdBy: c.var.user.id,
        })
        .returning();
      return c.json({ agent: view(agent!), token }, 201);
    })

    .post("/:id/rotate", async (c) => {
      const { token, hash, hint } = newToken();
      const [agent] = await c.var.services.database.db
        .update(schema.agents)
        .set({ tokenHash: hash, tokenHint: hint })
        .where(and(eq(schema.agents.id, c.req.param("id")), isNull(schema.agents.revokedAt)))
        .returning();
      if (!agent) fail(404, "not_found", "No active agent with that id.");
      onRevoke(agent.id);
      return c.json({ agent: view(agent), token });
    })

    .delete("/:id", async (c) => {
      const [agent] = await c.var.services.database.db
        .update(schema.agents)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.agents.id, c.req.param("id")), isNull(schema.agents.revokedAt)))
        .returning();
      if (!agent) fail(404, "not_found", "No active agent with that id.");
      onRevoke(agent.id);
      return c.json({ agent: view(agent) });
    });
