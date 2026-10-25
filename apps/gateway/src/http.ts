import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { ZodError, type z } from "zod";
import type { Services } from "./services";

export interface AppEnv {
  Variables: {
    services: Services;
    user: { id: string; name: string; email: string };
  };
}

type Status = 400 | 401 | 403 | 404 | 409 | 422 | 429;

/** Ends the request with `{ error: { code, message } }`. */
export function fail(status: Status, code: string, message: string): never {
  throw new HTTPException(status, { res: Response.json({ error: { code, message } }, { status }) });
}

export async function readBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    fail(400, "invalid_json", "The request body must be JSON.");
  }
  return schema.parse(raw);
}

/** Console routes: a signed-in person. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await c.var.services.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) fail(401, "unauthorized", "Sign in to continue.");
  c.set("user", { id: session.user.id, name: session.user.name, email: session.user.email });
  await next();
});

export function onError(err: Error, c: Context): Response {
  if (err instanceof HTTPException) return err.getResponse();
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return c.json({ error: { code: "invalid_request", message } }, 422);
  }
  console.error(
    JSON.stringify({ level: "error", path: c.req.path, error: err.stack ?? String(err) }),
  );
  return c.json({ error: { code: "internal", message: "Something went wrong." } }, 500);
}
