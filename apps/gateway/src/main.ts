import { createApp } from "./app";
import { loadConfig } from "./config";
import { createServices } from "./services";

const config = loadConfig();
const services = await createServices(config);
const { app, close } = createApp(services);

const server = Bun.serve({
  port: config.PORT,
  fetch: app.fetch,
  // Calls that wait for approval stay open for up to WRIT_APPROVAL_WAIT_SECONDS.
  idleTimeout: 255,
});
console.log(
  JSON.stringify({
    level: "info",
    msg: "writ gateway listening",
    port: server.port,
    mcp: `${config.PUBLIC_URL}/mcp`,
    database: services.database.kind,
  }),
);

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    server.stop();
    await close();
    await services.close();
    process.exit(0);
  });
