import * as cheerio from "cheerio";

export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(value);
}

export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, svg, iframe").remove();
  const text = $("body").length > 0 ? $("body").text() : $.root().text();
  return text.replace(/\s+/g, " ").trim();
}

export function toPlainText(value: string): string {
  const text = looksLikeHtml(value) ? htmlToText(value) : value;
  return text.replace(/\s+/g, " ").trim();
}
