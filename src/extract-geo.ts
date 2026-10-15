import { Country, State } from "country-state-city";

export type GeoMatch = {
  kind: "country" | "state";
  name: string;
  iso2: string;
  matchedText: string;
  context: string;
  stateCode?: string;
  parentCountry?: string;
};

type CountryRecord = { name: string; iso2: string };
type StateRecord = { name: string; stateCode: string; countryName: string };
type Span = {
  start: number;
  end: number;
  kind: "country" | "state";
  name: string;
  iso2: string;
  matchedText: string;
  stateCode?: string;
  parentCountry?: string;
};

type Alias = {
  text: string;
  iso2: string;
  caseSensitive: boolean;
};

const ALIASES: Alias[] = [
  { text: "United States of America", iso2: "US", caseSensitive: false },
  { text: "USA", iso2: "US", caseSensitive: true },
  { text: "U.S.A.", iso2: "US", caseSensitive: true },
  { text: "U.S.", iso2: "US", caseSensitive: true },
  { text: "US", iso2: "US", caseSensitive: true },
  { text: "Great Britain", iso2: "GB", caseSensitive: false },
  { text: "Britain", iso2: "GB", caseSensitive: false },
  { text: "UK", iso2: "GB", caseSensitive: true },
  { text: "U.K.", iso2: "GB", caseSensitive: true },
  { text: "UAE", iso2: "AE", caseSensitive: true },
  { text: "Holland", iso2: "NL", caseSensitive: false },
  { text: "Ivory Coast", iso2: "CI", caseSensitive: false },
  { text: "Côte d'Ivoire", iso2: "CI", caseSensitive: false },
  { text: "Cote d'Ivoire", iso2: "CI", caseSensitive: false },
  { text: "Czechia", iso2: "CZ", caseSensitive: false },
  { text: "Burma", iso2: "MM", caseSensitive: false },
];

const MAX_MATCHES = 80;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function boundarySource(literal: string): string {
  return `(?<![\\p{L}\\p{N}_])${escapeRegExp(literal)}(?![\\p{L}\\p{N}_])`;
}

function findSpans(
  text: string,
  source: string,
  flags: string,
): { start: number; end: number; text: string }[] {
  const expression = new RegExp(source, flags.includes("g") ? flags : `${flags}g`);
  const spans: { start: number; end: number; text: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text)) !== null) {
    if (match[0].length === 0) {
      expression.lastIndex += 1;
      continue;
    }
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }
  return spans;
}

function overlaps(left: { start: number; end: number }, right: { start: number; end: number }): boolean {
  return left.start < right.end && right.start < left.end;
}

function takeLongest(spans: Span[]): Span[] {
  const sorted = [...spans].sort(
    (left, right) => right.end - right.start - (left.end - left.start) || left.start - right.start,
  );
  const accepted: Span[] = [];
  for (const span of sorted) {
    if (accepted.some((other) => overlaps(span, other))) continue;
    accepted.push(span);
  }
  return accepted;
}

function sentenceAround(text: string, start: number, end: number): {
  context: string;
  sentenceStart: number;
  sentenceEnd: number;
} {
  const left = Math.max(
    text.lastIndexOf(". ", start),
    text.lastIndexOf("! ", start),
    text.lastIndexOf("? ", start),
  );
  let sentenceStart = left >= 0 ? left + 2 : 0;
  const endings = [text.indexOf(". ", end), text.indexOf("! ", end), text.indexOf("? ", end)].filter(
    (index) => index >= 0,
  );
  let sentenceEnd = endings.length > 0 ? Math.min(...endings) + 1 : text.length;

  if (sentenceEnd - sentenceStart > 400) {
    sentenceStart = Math.max(sentenceStart, start - 160);
    sentenceEnd = Math.min(sentenceEnd, end + 160);
  }

  return {
    context: text.slice(sentenceStart, sentenceEnd).trim(),
    sentenceStart,
    sentenceEnd,
  };
}

function buildCatalog(): {
  countries: CountryRecord[];
  statesByCountry: Map<string, StateRecord[]>;
  countryNameByIso: Map<string, string>;
} {
  const countries = Country.getAllCountries().map((country) => ({
    name: country.name,
    iso2: country.isoCode,
  }));
  const countryNameByIso = new Map(countries.map((country) => [country.iso2, country.name]));
  const statesByCountry = new Map<string, StateRecord[]>();

  for (const country of countries) {
    statesByCountry.set(
      country.iso2,
      State.getStatesOfCountry(country.iso2).map((state) => ({
        name: state.name,
        stateCode: state.isoCode,
        countryName: country.name,
      })),
    );
  }

  return { countries, statesByCountry, countryNameByIso };
}

const catalog = buildCatalog();

function countrySpans(text: string): Span[] {
  const found: Span[] = [];

  for (const country of catalog.countries) {
    for (const match of findSpans(text, boundarySource(country.name), "iu")) {
      found.push({
        start: match.start,
        end: match.end,
        kind: "country",
        name: country.name,
        iso2: country.iso2,
        matchedText: match.text,
      });
    }
  }

  for (const alias of ALIASES) {
    const official = catalog.countryNameByIso.get(alias.iso2);
    if (!official) continue;
    const flags = alias.caseSensitive ? "u" : "iu";
    for (const match of findSpans(text, boundarySource(alias.text), flags)) {
      found.push({
        start: match.start,
        end: match.end,
        kind: "country",
        name: official,
        iso2: alias.iso2,
        matchedText: match.text,
      });
    }
  }

  return takeLongest(found);
}

function reclassifyAmbiguousStates(spans: Span[], text: string): Span[] {
  return spans.map((span) => {
    const sentence = sentenceAround(text, span.start, span.end);
    const parents = spans.filter(
      (other) =>
        other.iso2 !== span.iso2 &&
        other.start >= sentence.sentenceStart &&
        other.start < sentence.sentenceEnd,
    );

    for (const parent of parents) {
      const state = catalog.statesByCountry
        .get(parent.iso2)
        ?.find((candidate) => candidate.name.toLowerCase() === span.matchedText.toLowerCase());
      if (!state) continue;
      return {
        ...span,
        kind: "state",
        name: state.name,
        iso2: parent.iso2,
        stateCode: state.stateCode,
        parentCountry: parent.name,
      };
    }

    return span;
  });
}

function stateSpans(text: string, existing: Span[]): Span[] {
  const countryIsos = new Set(
    existing.filter((span) => span.kind === "country").map((span) => span.iso2),
  );
  const nameCounts = new Map<string, number>();
  for (const iso of countryIsos) {
    for (const state of catalog.statesByCountry.get(iso) ?? []) {
      const key = state.name.toLowerCase();
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }
  }

  const found: Span[] = [];
  for (const iso of countryIsos) {
    for (const state of catalog.statesByCountry.get(iso) ?? []) {
      for (const match of findSpans(text, boundarySource(state.name), "iu")) {
        const span: Span = {
          start: match.start,
          end: match.end,
          kind: "state",
          name: state.name,
          iso2: iso,
          matchedText: match.text,
          stateCode: state.stateCode,
          parentCountry: state.countryName,
        };
        if (existing.some((other) => overlaps(span, other))) continue;

        const sentence = sentenceAround(text, span.start, span.end);
        const parentInSentence = existing.some(
          (other) =>
            other.kind === "country" &&
            other.iso2 === iso &&
            other.start >= sentence.sentenceStart &&
            other.start < sentence.sentenceEnd,
        );
        const uniqueOnPage = nameCounts.get(state.name.toLowerCase()) === 1;
        if (!parentInSentence && (state.name.length < 5 || !uniqueOnPage)) continue;
        found.push(span);
      }
    }
  }

  return takeLongest(found);
}

export function extractGeoMatches(pageText: string): GeoMatch[] {
  const text = pageText.replace(/\s+/g, " ").trim();
  if (!text) return [];

  const resolved = reclassifyAmbiguousStates(countrySpans(text), text);
  const states = stateSpans(text, resolved);
  const combined = [...resolved, ...states].sort((left, right) => left.start - right.start);
  const kept = new Map<string, Span>();

  for (const span of combined) {
    const sentence = sentenceAround(text, span.start, span.end);
    const key = `${span.kind}|${span.iso2}|${span.name}|${sentence.sentenceStart}`;
    const current = kept.get(key);
    if (!current || span.matchedText.length > current.matchedText.length) {
      kept.set(key, span);
    }
  }

  return [...kept.values()]
    .sort((left, right) => left.start - right.start)
    .slice(0, MAX_MATCHES)
    .map((span) => {
      const sentence = sentenceAround(text, span.start, span.end);
      const match: GeoMatch = {
        kind: span.kind,
        name: span.name,
        iso2: span.iso2,
        matchedText: span.matchedText,
        context: sentence.context,
      };
      if (span.stateCode) match.stateCode = span.stateCode;
      if (span.parentCountry) match.parentCountry = span.parentCountry;
      return match;
    });
}
