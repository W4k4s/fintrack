import { XMLParser } from "fast-xml-parser";

export interface ParsedItem {
  title: string;
  link: string;
  pubDate: string | null;
  guid: string | null;
  description: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
  cdataPropName: "__cdata",
});

function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.__cdata === "string") return obj.__cdata;
    if (typeof obj["#text"] === "string") return obj["#text"] as string;
    if (typeof obj["@_href"] === "string") return obj["@_href"] as string;
  }
  return "";
}

function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function extractAtomLink(linkField: unknown): string {
  if (typeof linkField === "string") return linkField;
  if (Array.isArray(linkField)) {
    const alt =
      linkField.find(
        (l) =>
          typeof l === "object" && l && (l as Record<string, unknown>)["@_rel"] === "alternate",
      ) ?? linkField[0];
    return text(alt);
  }
  return text(linkField);
}

export function parseFeed(xml: string): ParsedItem[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  // RSS 2.0: <rss><channel><item>...
  const rss = parsed.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const rssItems = channel?.item;
  if (rssItems) {
    const arr = Array.isArray(rssItems) ? rssItems : [rssItems];
    return arr.map((raw) => {
      const it = raw as Record<string, unknown>;
      const guidNode = it.guid as unknown;
      const guidStr = typeof guidNode === "string" ? guidNode : text(guidNode);
      return {
        title: text(it.title),
        link: text(it.link),
        pubDate: normalizeDate(text(it.pubDate)),
        guid: guidStr || null,
        description: text(it.description) || null,
      };
    });
  }

  // Atom: <feed><entry>...
  const feed = parsed.feed as Record<string, unknown> | undefined;
  const entries = feed?.entry;
  if (entries) {
    const arr = Array.isArray(entries) ? entries : [entries];
    return arr.map((raw) => {
      const it = raw as Record<string, unknown>;
      return {
        title: text(it.title),
        link: extractAtomLink(it.link),
        pubDate: normalizeDate(text(it.published ?? it.updated)),
        guid: typeof it.id === "string" ? (it.id as string) : null,
        description: text(it.summary ?? it.content) || null,
      };
    });
  }

  return [];
}
