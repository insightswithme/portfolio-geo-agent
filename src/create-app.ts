import "reflect-metadata";
import { Parameter, ParameterType, ToolsService } from "@optimizely-opal/opal-tools-sdk";
import cors from "cors";
import express from "express";
import type { AppConfig } from "./config";
import { extractGeoMatches, type GeoMatch } from "./extract-geo";
import { fetchPortfolioPage } from "./fetch-page";
import { toPlainText } from "./html";

const MAX_PAGE_TEXT = 500_000;

type ToolParameters = {
  url?: string;
  pageText?: string;
};

export type ToolResult = {
  status: "ok" | "auth_required" | "error";
  source?: "url" | "pageText";
  url?: string | null;
  httpStatus?: number;
  message?: string;
  guidance: string;
  totalMatches: number;
  matches: GeoMatch[];
};

function guidanceFor(status: ToolResult["status"]): string {
  if (status === "auth_required") {
    return "Ask the user to paste the page text or HTML, then call this tool again with pageText.";
  }
  if (status === "error") {
    return "Show the message to the user and stop.";
  }
  return "Keep a match only when its context shows a client, project, office, or team location. Drop ordinary-word hits such as a person's name.";
}

export async function runPortfolioGeoTool(
  parameters: ToolParameters,
  config: AppConfig,
): Promise<ToolResult> {
  const pageText = parameters.pageText?.trim() ?? "";
  const url = parameters.url?.trim() ?? "";

  if (pageText) {
    if (pageText.length > MAX_PAGE_TEXT) {
      return {
        status: "error",
        url: url || null,
        guidance: guidanceFor("error"),
        message: "pageText exceeds 500,000 characters.",
        totalMatches: 0,
        matches: [],
      };
    }
    const matches = extractGeoMatches(toPlainText(pageText));
    return {
      status: "ok",
      source: "pageText",
      url: url || null,
      guidance: guidanceFor("ok"),
      totalMatches: matches.length,
      matches,
    };
  }

  if (!url) {
    return {
      status: "error",
      guidance: guidanceFor("error"),
      message: "Provide a url or pageText.",
      totalMatches: 0,
      matches: [],
    };
  }

  const fetched = await fetchPortfolioPage(url, {
    allowedHosts: config.allowedHosts,
    bypassSecret: config.bypassSecret,
  });
  if (!fetched.ok) {
    return {
      status: fetched.status,
      source: "url",
      url,
      httpStatus: fetched.httpStatus,
      message: fetched.message,
      guidance: guidanceFor(fetched.status),
      totalMatches: 0,
      matches: [],
    };
  }

  const matches = extractGeoMatches(toPlainText(fetched.html));
  return {
    status: "ok",
    source: "url",
    url: fetched.finalUrl,
    guidance: guidanceFor("ok"),
    totalMatches: matches.length,
    matches,
  };
}

export function createApp(config: AppConfig): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  const tools = new ToolsService(app, {
    authMode: "static_token",
    bearerToken: config.toolSecret,
  });

  tools.registerTool(
    "fetch_portfolio_geo_data",
    "Fetches a portfolio page, or reads supplied page text, and returns country and state mentions with the sentence around each match.",
    (parameters: ToolParameters) => runPortfolioGeoTool(parameters, config),
    [
      new Parameter(
        "url",
        ParameterType.String,
        "HTTP or HTTPS URL of the portfolio page.",
        false,
      ),
      new Parameter(
        "pageText",
        ParameterType.String,
        "Raw portfolio text or HTML. When this is present, the tool skips the URL fetch.",
        false,
      ),
    ],
    "/tools/fetch-portfolio-geo-data",
  );

  return app;
}
