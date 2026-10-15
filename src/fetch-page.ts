import { assertFetchableUrl, FetchError } from "./network";

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

export type PageFetchResult =
  | { ok: true; html: string; finalUrl: string }
  | {
      ok: false;
      status: "auth_required" | "error";
      message: string;
      httpStatus?: number;
      finalUrl?: string;
    };

type FetchOptions = {
  allowedHosts: readonly string[];
  bypassSecret?: string;
};

export function isVercelAuthWall(input: {
  status: number;
  finalUrl: string;
  headers: { get(name: string): string | null };
  bodyPreview: string;
}): boolean {
  if (input.status === 401 || input.status === 403) return true;
  if (input.headers.get("x-vercel-mitigated") || input.headers.get("x-vercel-protection")) {
    return true;
  }

  try {
    const url = new URL(input.finalUrl);
    if (url.hostname === "vercel.com" && /login|sso/i.test(url.pathname)) return true;
  } catch {
    return false;
  }

  const preview = input.bodyPreview.slice(0, 8000);
  return (
    /vercel\.com\/(login|sso)/i.test(preview) ||
    /Vercel Authentication/i.test(preview) ||
    (/vercel/i.test(preview) && /Deployment Protection/i.test(preview))
  );
}

function headersFor(url: URL, options: FetchOptions): Headers {
  const headers = new Headers({
    Accept: "text/html,application/xhtml+xml",
    "User-Agent": "Mozilla/5.0 (compatible; OptimizelyOpalAgent/1.0)",
  });
  if (options.bypassSecret && options.allowedHosts.includes(url.hostname.toLowerCase())) {
    headers.set("x-vercel-protection-bypass", options.bypassSecret);
  }
  return headers;
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FetchError("The response exceeded 1 MB.");
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

function redirectTarget(current: URL, location: string | null): URL | null {
  if (!location) return null;
  try {
    return new URL(location, current);
  } catch {
    return null;
  }
}

export async function fetchPortfolioPage(
  rawUrl: string,
  options: FetchOptions,
): Promise<PageFetchResult> {
  const allowed = new Set(options.allowedHosts.map((host) => host.toLowerCase()));
  let current: URL;
  try {
    current = await assertFetchableUrl(rawUrl, allowed);
  } catch (error) {
    return {
      ok: false,
      status: "error",
      message: error instanceof Error ? error.message : "The URL could not be fetched.",
    };
  }

  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const response = await fetch(current, {
        headers: headersFor(current, options),
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = redirectTarget(current, response.headers.get("location"));
        await response.body?.cancel();
        if (!next) {
          return {
            ok: false,
            status: "error",
            httpStatus: response.status,
            finalUrl: current.toString(),
            message: "The page redirect did not include a location.",
          };
        }
        if (isVercelAuthWall({ status: 302, finalUrl: next.toString(), headers: response.headers, bodyPreview: "" })) {
          return {
            ok: false,
            status: "auth_required",
            httpStatus: response.status,
            finalUrl: next.toString(),
            message:
              "The portfolio URL redirected to a Vercel login. Make the deployment public, set VERCEL_BYPASS_SECRET, or paste the page text.",
          };
        }
        try {
          current = await assertFetchableUrl(next.toString(), allowed);
        } catch (error) {
          return {
            ok: false,
            status: "error",
            httpStatus: response.status,
            finalUrl: next.toString(),
            message: error instanceof Error ? error.message : "The redirect target was blocked.",
          };
        }
        continue;
      }

      const html = await readLimited(response);
      if (
        isVercelAuthWall({
          status: response.status,
          finalUrl: current.toString(),
          headers: response.headers,
          bodyPreview: html,
        })
      ) {
        return {
          ok: false,
          status: "auth_required",
          httpStatus: response.status,
          finalUrl: current.toString(),
          message:
            "The portfolio URL requires authentication. Make the Vercel deployment public, set VERCEL_BYPASS_SECRET, or paste the page text.",
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          status: "error",
          httpStatus: response.status,
          finalUrl: current.toString(),
          message: `The URL returned HTTP ${response.status}.`,
        };
      }

      return { ok: true, html, finalUrl: current.toString() };
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      status: "error",
      finalUrl: current.toString(),
      message: timedOut ? "The request timed out." : "The URL could not be fetched.",
    };
  }

  return {
    ok: false,
    status: "error",
    finalUrl: current.toString(),
    message: "The URL redirected too many times.",
  };
}
