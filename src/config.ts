import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_PORTFOLIO_HOST =
  "insightswithme-github-io-insightswithme.vercel.app";

export const DEFAULT_PORTFOLIO_URL = `https://${DEFAULT_PORTFOLIO_HOST}/portfolio`;

export type AppConfig = {
  toolSecret: string;
  port: number;
  allowedHosts: string[];
  bypassSecret?: string;
};

export function loadEnvFile(path = resolve(process.cwd(), ".env")): void {
  if (!existsSync(path)) return;

  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const toolSecret = env.OPAL_TOOL_SECRET?.trim() ?? "";
  if (toolSecret.length < 16) {
    throw new Error(
      "Set OPAL_TOOL_SECRET to a random string of at least 16 characters.",
    );
  }

  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535.");
  }

  const allowedHosts = (
    env.ALLOWED_HOSTS?.trim()
      ? env.ALLOWED_HOSTS.split(",")
      : [DEFAULT_PORTFOLIO_HOST]
  )
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  if (allowedHosts.length === 0) {
    throw new Error("ALLOWED_HOSTS must include at least one host.");
  }

  const bypassSecret = env.VERCEL_BYPASS_SECRET?.trim();
  return {
    toolSecret,
    port,
    allowedHosts,
    bypassSecret: bypassSecret || undefined,
  };
}
