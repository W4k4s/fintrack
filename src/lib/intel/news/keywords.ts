export const KEYWORDS: readonly RegExp[] = [
  // Macro tier 1
  /\b(ecb|bce|federal reserve|\bfed\b|fomc|powell|lagarde|christine lagarde)\b/i,
  /\b(rate (cut|hike|decision)|interest rates?|monetary policy)\b/i,
  /\b(cpi|inflation (data|report|rises?|falls?)|nfp|jobs report|payrolls)\b/i,
  // Regulatorio
  /\b(sec (lawsuit|charges|investigat\w+)|mica|regulation|banned?|crackdown|indictment)\b/i,
  // Catalizadores crypto
  /\b(bitcoin etf|spot etf|etf approv\w+|halving|pectra|dencun|upgrade|fork)\b/i,
  // Stablecoin risk
  /\b(usdc|usdt|tether|circle|stablecoin|depeg\w*)\b/i,
  // Existencial / crash
  /\b(hack(s|ed|ing)?|exploit(s|ed)?|breach|stolen|insolvenc\w+|bankruptc\w+|default|liquidation)\b/i,
  /\b(crash|plunge|sell-off|selloff|rout|tumble)\b/i,
  /\b(ath|all-time high|rally|record high)\b/i,
];

export function matchesAnyKeyword(text: string): RegExpMatchArray[] {
  const hits: RegExpMatchArray[] = [];
  for (const re of KEYWORDS) {
    const m = text.match(re);
    if (m) hits.push(m);
  }
  return hits;
}
