export type AssetClass = "cash" | "crypto" | "etfs" | "gold" | "bonds" | "stocks";

const CASH = new Set(["EUR", "USDC", "USDT", "USD"]);
const GOLD = new Set(["Gold ETC", "XAU", "PAXG"]);
const BONDS = new Set(["EU Infl Bond"]);
const ETFS = new Set(["MSCI World", "MSCI Momentum"]);
const STOCKS = new Set(["MSFT", "SAN", "SAN.MC"]);

// Fallback: cualquier símbolo no listado arriba se trata como crypto.
// Suficiente para el portfolio actual (BTC/ETH/SOL/PEPE/BNB/SHIB/ROSE/MANA/S/XCH/GPU).

export function classifyAsset(symbol: string): AssetClass {
  if (CASH.has(symbol)) return "cash";
  if (GOLD.has(symbol)) return "gold";
  if (BONDS.has(symbol)) return "bonds";
  if (ETFS.has(symbol)) return "etfs";
  if (STOCKS.has(symbol)) return "stocks";
  return "crypto";
}

export const ASSET_CLASSES: AssetClass[] = ["cash", "crypto", "etfs", "gold", "bonds", "stocks"];
