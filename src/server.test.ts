import assert from "node:assert/strict";
import { type AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";
import { createApp } from "./create-app";

const secret = "test-secret-123456";
let server: Server;
let baseUrl = "";

before(async () => {
  const app = createApp({
    toolSecret: secret,
    port: 0,
    allowedHosts: ["insightswithme-github-io-insightswithme.vercel.app"],
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("portfolio geo tool server", () => {
  it("publishes the Opal discovery manifest", async () => {
    const response = await fetch(`${baseUrl}/discovery`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      functions: {
        name: string;
        endpoint: string;
        parameters: { name: string; type: string; required: boolean }[];
      }[];
    };
    assert.equal(body.functions[0].name, "fetch_portfolio_geo_data");
    assert.equal(body.functions[0].endpoint, "/tools/fetch-portfolio-geo-data");
    assert.deepEqual(
      body.functions[0].parameters.map((parameter) => parameter.name),
      ["url", "pageText"],
    );
    assert.equal(body.functions[0].parameters[0].type, "string");
  });

  it("rejects tool calls without the bearer token", async () => {
    const response = await fetch(`${baseUrl}/tools/fetch-portfolio-geo-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageText: "India" }),
    });
    assert.equal(response.status, 401);
  });

  it("extracts locations from pasted HTML", async () => {
    const response = await fetch(`${baseUrl}/tools/fetch-portfolio-geo-data`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parameters: {
          pageText: "<p>Delivery center in Karnataka, India.</p>",
        },
      }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      status: string;
      source: string;
      matches: { kind: string; name: string; iso2: string }[];
    };
    assert.equal(body.status, "ok");
    assert.equal(body.source, "pageText");
    assert.deepEqual(
      body.matches.map((match) => [match.kind, match.name, match.iso2]),
      [
        ["state", "Karnataka", "IN"],
        ["country", "India", "IN"],
      ],
    );
  });

  it("does not fetch hosts outside the allowlist", async () => {
    const response = await fetch(`${baseUrl}/tools/fetch-portfolio-geo-data`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "http://127.0.0.1/secret" }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string; message: string; matches: unknown[] };
    assert.equal(body.status, "error");
    assert.equal(body.matches.length, 0);
    assert.match(body.message, /ALLOWED_HOSTS/);
  });
});
