import { EFFECTS, type Effect } from "@writ/policy";
import { schema } from "@writ/store";
import { SLUG } from "@writ/upstream";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Upstream } from "../gate/catalog";
import { type AppEnv, fail, readBody } from "../http";

const Headers = z.record(z.string().regex(/^[A-Za-z0-9-]+$/), z.string().max(4000));

const Create = z.object({
  name: z.string().trim().toLowerCase().max(30).regex(SLUG, "lowercase letters, digits and dashes"),
  url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//.test(u), "must be http(s)"),
  headers: Headers.optional(),
  trusted: z.boolean().default(false),
});

const Update = z.object({
  url: Create.shape.url.optional(),
  /** Replaces all headers; omit to keep the current ones. */
  headers: Headers.optional(),
  trusted: z.boolean().optional(),
  enabled: z.boolean().optional(),
  toolEffects: z.record(z.string(), z.enum(EFFECTS as [Effect, ...Effect[]])).optional(),
});

/** Never sends credentials back: only which header names are set. */
const view = async (row: Upstream, c: { var: AppEnv["Variables"] }) => ({
  id: row.id,
  name: row.name,
  url: row.url,
  headerNames: row.headers
    ? Object.keys(JSON.parse(await c.var.services.secrets.open(row.headers)) as object)
    : [],
  trusted: row.trusted,
  enabled: row.enabled,
  toolEffects: row.toolEffects,
  status: row.status,
  lastError: row.lastError,
  createdAt: row.createdAt,
});

async function own(c: { var: AppEnv["Variables"] }, id: string): Promise<Upstream> {
  const [row] = await c.var.services.database.db
    .select()
    .from(schema.upstreams)
    .where(eq(schema.upstreams.id, id));
  if (!row) fail(404, "not_found", "No upstream with that id.");
  return row;
}

/** Tools of an upstream as the console shows them, or the error that stopped listing them. */
async function toolsOf(c: { var: AppEnv["Variables"] }, row: Upstream, fresh = false) {
  try {
    const tools = await c.var.services.catalog.toolsOf(row, { fresh });
    return {
      tools: tools.map((t) => ({
        name: t.tool.name,
        exposed: t.exposed,
        title: t.tool.title ?? t.tool.annotations?.title ?? null,
        description: t.tool.description ?? null,
        effect: t.effect,
        overridden: t.tool.name in row.toolEffects,
      })),
      error: null,
    };
  } catch (error) {
    return { tools: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export const upstreams = new Hono<AppEnv>()
  .get("/", async (c) => {
    const rows = await c.var.services.database.db
      .select()
      .from(schema.upstreams)
      .orderBy(asc(schema.upstreams.name));
    return c.json({ upstreams: await Promise.all(rows.map((r) => view(r, c))) });
  })

  .post("/", async (c) => {
    const input = await readBody(c, Create);
    const { db } = c.var.services.database;
    const [taken] = await db
      .select({ id: schema.upstreams.id })
      .from(schema.upstreams)
      .where(eq(schema.upstreams.name, input.name));
    if (taken) fail(409, "conflict", `An upstream named "${input.name}" already exists.`);
    const [row] = await db
      .insert(schema.upstreams)
      .values({
        name: input.name,
        url: input.url,
        trusted: input.trusted,
        headers: input.headers
          ? await c.var.services.secrets.seal(JSON.stringify(input.headers))
          : null,
      })
      .returning();
    const listed = await toolsOf(c, row!, true);
    const [fresh] = await db
      .select()
      .from(schema.upstreams)
      .where(eq(schema.upstreams.id, row!.id));
    return c.json({ upstream: await view(fresh!, c), ...listed }, 201);
  })

  .get("/:id", async (c) => {
    const row = await own(c, c.req.param("id"));
    const listed = await toolsOf(c, row, c.req.query("fresh") === "1");
    return c.json({ upstream: await view(await own(c, row.id), c), ...listed });
  })

  .patch("/:id", async (c) => {
    const input = await readBody(c, Update);
    const row = await own(c, c.req.param("id"));
    const [updated] = await c.var.services.database.db
      .update(schema.upstreams)
      .set({
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.trusted !== undefined ? { trusted: input.trusted } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.toolEffects !== undefined ? { toolEffects: input.toolEffects } : {}),
        ...(input.headers !== undefined
          ? {
              headers: Object.keys(input.headers).length
                ? await c.var.services.secrets.seal(JSON.stringify(input.headers))
                : null,
            }
          : {}),
      })
      .where(eq(schema.upstreams.id, row.id))
      .returning();
    return c.json({ upstream: await view(updated!, c) });
  })

  .delete("/:id", async (c) => {
    const row = await own(c, c.req.param("id"));
    await c.var.services.database.db
      .delete(schema.upstreams)
      .where(eq(schema.upstreams.id, row.id));
    c.var.services.pool.drop(row.id);
    return c.body(null, 204);
  });
