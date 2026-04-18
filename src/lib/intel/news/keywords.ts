export const KEYWORDS: readonly RegExp[] = [
  // Macro tier 1
  /\b(ecb|bce|federal reserve|\bfed\b|fomc|powell|lagarde|christine lagarde)\b/i,
  /\b(rate (cut|hike|decision)|interest rates?|monetary policy)\b/i,
  /\b(cpi|inflation (data|report|rises?|falls?)|nfp|jobs report|payrolls)\b/i,
  // Regulatorio
  /\b(sec (lawsuit|charges|investigat\w+|filing)|mica|regulation|banned?|crackdown|indictment)\b/i,
  // Catalizadores crypto
  /\b(bitcoin etf|spot etf|etf approv\w+|halving|pectra|dencun|upgrade|fork)\b/i,
  // Stablecoin risk
  /\b(usdc|usdt|tether|circle|stablecoin|depeg\w*)\b/i,
  // Existencial / crash
  /\b(hack(s|ed|ing)?|exploit(s|ed)?|breach|stolen|insolvenc\w+|bankruptc\w+|default|liquidation)\b/i,
  /\b(crash|plunge|sell-off|selloff|rout|tumble)\b/i,
  /\b(ath|all-time high|rally|record high)\b/i,
  // Equity — earnings / guidance
  /\b(earnings (beat|miss|report|season)|eps (beat|miss)|revenue (beat|miss)|guidance (cut|raise|lowered|hiked))\b/i,
  // Equity — corporate actions
  /\b(dividend (cut|hike|suspen\w+|raise)|buyback|share repurchase|spin-?off|stock split)\b/i,
  // Equity — M&A
  /\b(acquisition|merger|takeover|tender offer|antitrust|hostile bid)\b/i,
  // Equity — macro
  /\b(recession|gdp (growth|contraction)|unemployment rate|\bpmi\b|retail sales|yield curve|bond yields?|treasury yields?)\b/i,
  // Geopolítica que mueve equity
  /\b(tariffs?|trade war|sanctions?|embargo)\b/i,
  // Índices y volatilidad
  /\b(s&p ?500|sp500|nasdaq|dow jones|russell 2000|stoxx|vix (spike|surge|jumps?))\b/i,
];

export function matchesAnyKeyword(text: string): RegExpMatchArray[] {
  const hits: RegExpMatchArray[] = [];
  for (const re of KEYWORDS) {
    const m = text.match(re);
    if (m) hits.push(m);
  }
  return hits;
}
