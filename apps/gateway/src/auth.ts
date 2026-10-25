import { type Db, schema } from "@writ/store";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Config } from "./config";

/** Console sign-in: email and password. Sign-up rules live in the app (see `signupOpen`). */
export function createAuth(db: Db, config: Config) {
  return betterAuth({
    appName: "Writ",
    baseURL: config.PUBLIC_URL,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: [config.PUBLIC_URL],
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    rateLimit: { enabled: config.NODE_ENV !== "test", window: 60, max: 30 },
    advanced: { useSecureCookies: config.PUBLIC_URL.startsWith("https://") },
  });
}

export type Auth = ReturnType<typeof createAuth>;
