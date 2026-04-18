export type PublisherTier = 1 | 2 | 3;

export interface NewsFeed {
  source: string;
  url: string;
  tier: PublisherTier;
}

export const FEEDS: readonly NewsFeed[] = [
  // Tier 1 — autoridad macro
  { source: "ecb", url: "https://www.ecb.europa.eu/rss/press.html", tier: 1 },
  { source: "fed", url: "https://www.federalreserve.gov/feeds/press_all.xml", tier: 1 },
  { source: "bloomberg", url: "https://feeds.bloomberg.com/markets/news.rss", tier: 1 },
  { source: "ft", url: "https://www.ft.com/rss/home/international", tier: 1 },
  // Tier 2 — crypto-native de calidad
  { source: "coindesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml", tier: 2 },
  { source: "theblock", url: "https://www.theblock.co/rss.xml", tier: 2 },
  // Tier 2 — equity/markets
  { source: "marketwatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", tier: 2 },
  // Tier 3 — agregadores rápidos
  { source: "cointelegraph", url: "https://cointelegraph.com/rss", tier: 3 },
  { source: "decrypt", url: "https://decrypt.co/feed", tier: 3 },
  { source: "seekingalpha", url: "https://seekingalpha.com/market_currents.xml", tier: 3 },
];
