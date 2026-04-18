import type { ParsedItem } from "./parser";
import type { PublisherTier } from "./feeds";
import { matchesAnyKeyword } from "./keywords";

export interface ScoreBreakdown {
  base: number;
  tier: number;
  keywordHit: number;
  assetMention: number;
  recency: number;
  total: number;
}

export interface ScoredItem {
  score: number;
  breakdown: ScoreBreakdown;
  assetsMentioned: string[];
  keywordsMatched: string[];
}

const TIER_WEIGHT: Record<PublisherTier, number> = { 1: 30, 2: 20, 3: 10 };

export interface AssetAliases {
  asset: string;
  patterns: RegExp[];
}

function buildAliases(assets: readonly string[]): AssetAliases[] {
  const seen = new Set<string>();
  const result: AssetAliases[] = [];
  for (const asset of assets) {
    const key = asset.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const patterns: RegExp[] = [new RegExp(`\\b${escapeRe(asset)}\\b`, "i")];
    const extras = ASSET_SYNONYMS[key];
    if (extras) patterns.push(...extras.map((w) => new RegExp(`\\b${escapeRe(w)}\\b`, "i")));
    result.push({ asset: key, patterns });
  }
  return result;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ASSET_SYNONYMS: Record<string, string[]> = {
  BTC: ["bitcoin"],
  ETH: ["ethereum", "ether"],
  SOL: ["solana"],
  USDC: ["usd coin", "circle"],
  USDT: ["tether"],
  "MSCI WORLD": ["msci world", "iwda", "world index"],
  "MSCI MOMENTUM": ["msci momentum", "iwmo", "momentum factor"],
  "GOLD ETC": ["gold", "xau", "gold price", "gold bullion"],
  "EU INFL BOND": [
    "inflation-linked bond",
    "inflation linked bond",
    "tips",
    "linker",
    "inflation-protected",
  ],
  MSFT: ["microsoft"],
};

function recencyPenalty(publishedAtIso: string, now: Date): number {
  const pub = new Date(publishedAtIso).getTime();
  if (Number.isNaN(pub)) return -30;
  const hours = (now.getTime() - pub) / 3_600_000;
  if (hours < 2) return 0;
  if (hours < 12) return -5;
  if (hours < 48) return -15;
  return -40;
}

export function scoreArticle(
  item: ParsedItem,
  tier: PublisherTier,
  aliasesInput: readonly AssetAliases[] | readonly string[],
  now: Date = new Date(),
): ScoredItem {
  const aliases: AssetAliases[] =
    aliasesInput.length === 0 || typeof aliasesInput[0] === "object"
      ? (aliasesInput as AssetAliases[]).slice()
      : buildAliases(aliasesInput as readonly string[]);

  const haystack = `${item.title ?? ""} ${(item.description ?? "").slice(0, 400)}`;

  const hits = matchesAnyKeyword(haystack);
  const keywordsMatched = hits.map((m) => m[0].toLowerCase());
  const keywordHit = hits.length > 0 ? 40 : 0;

  const assetsMentioned: string[] = [];
  for (const a of aliases) {
    if (a.patterns.some((re) => re.test(haystack))) assetsMentioned.push(a.asset);
  }
  const assetMention = assetsMentioned.length > 0 ? 20 : 0;

  const base = 10;
  const tierScore = TIER_WEIGHT[tier];
  const recency = recencyPenalty(item.pubDate ?? "", now);
  const total = Math.max(0, base + tierScore + keywordHit + assetMention + recency);

  return {
    score: total,
    breakdown: { base, tier: tierScore, keywordHit, assetMention, recency, total },
    assetsMentioned,
    keywordsMatched: Array.from(new Set(keywordsMatched)),
  };
}

export { buildAliases };
