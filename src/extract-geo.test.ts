import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractGeoMatches } from "./extract-geo";

describe("extractGeoMatches", () => {
  it("finds countries, aliases, and states mentioned in the same sentence", () => {
    const matches = extractGeoMatches(
      "Teams in Bengaluru, India and Austin, Texas, USA support the rollout.",
    );

    assert.deepEqual(
      matches.map((match) => [match.kind, match.name, match.iso2]),
      [
        ["country", "India", "IN"],
        ["state", "Texas", "US"],
        ["country", "United States", "US"],
      ],
    );
    assert.equal(matches.find((match) => match.name === "Texas")?.stateCode, "TX");
    assert.match(matches[0].context, /Bengaluru, India/);
  });

  it("keeps Papua New Guinea as one country", () => {
    const matches = extractGeoMatches("The office is in Papua New Guinea.");
    assert.deepEqual(
      matches.map((match) => match.iso2),
      ["PG"],
    );
  });

  it("prefers the longer Congo name", () => {
    const matches = extractGeoMatches("Work spans the Democratic Republic of the Congo.");
    assert.deepEqual(
      matches.map((match) => [match.name, match.iso2]),
      [["Democratic Republic of the Congo", "CD"]],
    );
  });

  it("treats Georgia as a US state when the United States is in the same sentence", () => {
    const matches = extractGeoMatches("Atlanta, Georgia, USA.");
    assert.deepEqual(
      matches.map((match) => [match.kind, match.name, match.iso2]),
      [
        ["state", "Georgia", "US"],
        ["country", "United States", "US"],
      ],
    );
    assert.equal(matches[0].stateCode, "GA");
  });

  it("keeps the country Georgia when the United States is not mentioned", () => {
    const matches = extractGeoMatches("The client headquarters is in Georgia.");
    assert.deepEqual(
      matches.map((match) => [match.kind, match.iso2]),
      [["country", "GE"]],
    );
  });

  it("resolves Ivory Coast to the official country record", () => {
    const matches = extractGeoMatches("Partners in Ivory Coast.");
    assert.equal(matches.length, 1);
    assert.equal(matches[0].iso2, "CI");
    assert.equal(matches[0].matchedText, "Ivory Coast");
  });

  it("matches a parenthesized country name literally", () => {
    const matches = extractGeoMatches("Deployment in Virgin Islands (US).");
    assert.equal(matches.some((match) => match.name === "Virgin Islands (US)"), true);
  });

  it("returns no matches for empty text", () => {
    assert.deepEqual(extractGeoMatches("   "), []);
  });
});
