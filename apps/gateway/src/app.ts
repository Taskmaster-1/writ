import { schema } from "@writ/store";
import { count } from "drizzle-orm";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { agents } from "./api/agents";
import { calls } from "./api/calls";
import { policy } from "./api/policy";
import { upstreams } from "./api/upstreams";
import { type AppEnv, onError, requireUser } from "./http";
import { McpEndpoint } from "./mcp/endpoint";
import type { Services } from "./services";

export function createApp(services: Services) {
  const { config } = services;
  const origin = new URL(config.PUBLIC_URL).origin;
  const mcp = new McpEndpoint(services);
  const app = new Hono<AppEnv>();

  app.use(secureHeaders());
  app.use(async (c, next) => {
    c.set("services", services);
    await next();
  });
  app.onError(onError);

  // Browsers send Origin on cross-site requests. The console's API only accepts its own
  // origin for writes; /mcp is for agents, so any browser origin other than ours is refused
  // (this also stops DNS-rebinding attacks on a gateway running on localhost).
  app.use("*", async (c, next) => {
    const requestOrigin = c.req.header("origin");
    const write = c.req.method !== "GET" && c.req.method !== "HEAD";
    const mcpPath = c.req.path === "/mcp";
    if (requestOrigin && requestOrigin !== origin && (write || mcpPath))
      return c.json(
        { error: { code: "forbidden", message: "Cross-origin request rejected." } },
        403,
      );
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  /** Whether the console should offer to create the first (owner) account. */
  app.get("/api/setup", async (c) => {
    const [row] = await services.database.db.select({ n: count() }).from(schema.user);
    const needsOwner = (row?.n ?? 0) === 0;
    return c.json({ needsOwner, signupOpen: needsOwner || config.ALLOW_SIGNUP });
  });

  // The first account is always allowed; after that, only with ALLOW_SIGNUP=true.
  app.post("/api/auth/sign-up/*", async (c, next) => {
    if (config.ALLOW_SIGNUP) return next();
    const [row] = await services.database.db.select({ n: count() }).from(schema.user);
    if ((row?.n ?? 0) > 0)
      return c.json(
        {
          error: {
            code: "signup_closed",
            message: "Sign-up is closed. Ask the owner for an account.",
          },
        },
        403,
      );
    return next();
  });
  app.on(["GET", "POST"], "/api/auth/*", (c) => services.auth.handler(c.req.raw));

  app.all("/mcp", mcp.handle);

  const api = new Hono<AppEnv>();
  api.use(requireUser);
  api.get("/me", (c) => c.json({ user: c.var.user }));
  api.route("/calls", calls);
  api.route(
    "/agents",
    agents((agentId) => mcp.dropAgent(agentId)),
  );
  api.route("/upstreams", upstreams);
  api.route("/policy", policy);
  app.route("/api", api);

  return { app, close: () => mcp.close() };
}
