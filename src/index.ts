import "reflect-metadata";
import { loadConfig, loadEnvFile } from "./config";
import { createApp } from "./create-app";

loadEnvFile();

let config;
try {
  config = loadConfig();
} catch (error) {
  const message = error instanceof Error ? error.message : "Configuration is invalid.";
  console.error(message);
  process.exit(1);
}

const app = createApp(config);
const server = app.listen(config.port, () => {
  console.log(`Portfolio geo tool listening on port ${config.port}`);
  console.log(`Discovery URL: http://localhost:${config.port}/discovery`);
  console.log("Tool execution requires Authorization: Bearer <OPAL_TOOL_SECRET>");
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${config.port} is already in use. Stop the other process or set a different PORT in .env.`,
    );
  } else {
    console.error(error.message);
  }
  process.exit(1);
});
