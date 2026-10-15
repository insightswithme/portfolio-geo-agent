import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchPortfolioPage, isVercelAuthWall } from "./fetch-page";
import { isPrivateIp } from "./network";

describe("isPrivateIp", () => {
  it("blocks loopback, link-local, and private ranges", () => {
    assert.equal(isPrivateIp("127.0.0.1"), true);
    assert.equal(isPrivateIp("10.1.2.3"), true);
    assert.equal(isPrivateIp("169.254.169.254"), true);
    assert.equal(isPrivateIp("192.168.1.10"), true);
    assert.equal(isPrivateIp("::1"), true);
    assert.equal(isPrivateIp("8.8.8.8"), false);
  });
});

describe("isVercelAuthWall", () => {
  const headers = { get: () => null };

  it("treats HTTP 401 and Vercel login redirects as authentication walls", () => {
    assert.equal(
      isVercelAuthWall({
        status: 401,
        finalUrl: "https://example.com/portfolio",
        headers,
        bodyPreview: "",
      }),
      true,
    );
    assert.equal(
      isVercelAuthWall({
        status: 302,
        finalUrl: "https://vercel.com/login?next=%2F",
        headers,
        bodyPreview: "",
      }),
      true,
    );
    assert.equal(
      isVercelAuthWall({
        status: 302,
        finalUrl: "https://vercel.com/sso-api?url=https%3A%2F%2Fexample.vercel.app%2Fportfolio",
        headers,
        bodyPreview: "",
      }),
      true,
    );
  });

  it("leaves a normal page that mentions authentication alone", () => {
    assert.equal(
      isVercelAuthWall({
        status: 200,
        finalUrl: "https://example.com/portfolio",
        headers,
        bodyPreview: "<p>Authentication required for the client portal.</p>",
      }),
      false,
    );
  });
});

describe("fetchPortfolioPage", () => {
  it("rejects hosts outside the allowlist", async () => {
    const result = await fetchPortfolioPage("https://example.com/portfolio", {
      allowedHosts: ["insightswithme-github-io-insightswithme.vercel.app"],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /ALLOWED_HOSTS/);
  });

  it("rejects private addresses even when the host is allowlisted", async () => {
    const result = await fetchPortfolioPage("http://127.0.0.1/portfolio", {
      allowedHosts: ["127.0.0.1"],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /private/i);
  });
});
