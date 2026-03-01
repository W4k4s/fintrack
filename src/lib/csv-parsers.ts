/**
 * CSV Parsers for exchange trade history imports.
 * 
 * Each parser normalizes the exchange-specific CSV format into a common CsvTrade shape
 * that matches the transactions schema.
 */

export interface CsvTrade {
  date: string;       // YYYY-MM-DD
  datetime: string;   // ISO string for dedup precision
  type: "buy" | "sell";
  symbol: string;     // base asset (e.g. "BTC")
  pair: string;       // original pair (e.g. "BTCUSDT")
  amount: number;     // quantity of base asset
  price: number;      // price per unit in quote currency
  total: number;      // amount * price (cost)
  fee: number;
  feeCurrency: string;
}

/**
 * Parse a CSV string into rows. Handles quoted fields with commas inside.
 */
function parseCsvRows(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  return lines.map(line => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  });
}

function normalizeHeader(h: string): string {
  return h.replace(/\ufeff/g, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
}

function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace(/,/g, "")) || 0;
}

function splitPair(pair: string): { base: string; quote: string } {
  const quotes = ["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "USD", "EUR", "BTC", "ETH", "BNB", "KCS"];
  for (const q of quotes) {
    if (pair.endsWith(q) && pair.length > q.length) {
      return { base: pair.slice(0, -q.length), quote: q };
    }
  }
  if (pair.includes("/")) {
    const [base, quote] = pair.split("/");
    return { base, quote };
  }
  if (pair.includes("-")) {
    const [base, quote] = pair.split("-");
    return { base, quote };
  }
  return { base: pair, quote: "USDT" };
}

// ─────────────────────────────────────────────
// Binance
// ─────────────────────────────────────────────
// Format variants:
// 1. Trade History: Date(UTC),Pair,Side,Price,Executed,Amount,Fee
// 2. Order History: Date(UTC),OrderNo,Pair,Type,Side,Order Price,Order Amount,Avg Trading Price,Filled,Total,status
// 3. Newer: Date(UTC),Market,Type,Price,Amount,Total,Fee,Fee Coin

function parseBinance(text: string): CsvTrade[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  
  const headers = rows[0].map(normalizeHeader);
  const trades: CsvTrade[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue;
    
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => obj[h] = row[idx]);

    const dateStr = obj["date_utc_"] || obj["date_utc"] || obj["date"] || obj["time"] || "";
    const pairStr = obj["pair"] || obj["market"] || obj["symbol"] || "";
    const sideStr = (obj["side"] || obj["type"] || "").toUpperCase();
    
    if (!dateStr || !pairStr || !sideStr) continue;
    
    const { base, quote } = splitPair(pairStr.replace(/[-_/]/g, ""));
    const side = sideStr.includes("BUY") ? "buy" : "sell";

    const price = parseNumber(obj["price"] || obj["avg_trading_price"] || obj["order_price"]);
    const amount = parseNumber(obj["executed"] || obj["filled"] || obj["amount"] || obj["qty"]);
    // "Amount" in Binance trade history is the total (quote), "Executed" is the qty (base)
    // If we have both "executed" and "amount", total = amount column
    const hasExecuted = obj["executed"] !== undefined;
    const total = hasExecuted
      ? parseNumber(obj["amount"] || obj["total"])
      : parseNumber(obj["total"]) || (price * amount);
    const fee = parseNumber(obj["fee"]);
    const feeCurrency = obj["fee_coin"] || obj["fee_currency"] || quote;

    if (amount <= 0) continue;

    const dt = new Date(dateStr + (dateStr.includes("Z") || dateStr.includes("+") ? "" : " UTC"));
    
    trades.push({
      date: dt.toISOString().split("T")[0],
      datetime: dt.toISOString(),
      type: side,
      symbol: base,
      pair: pairStr,
      amount,
      price: price || (total / amount),
      total: total || (price * amount),
      fee,
      feeCurrency,
    });
  }

  return trades;
}

// ─────────────────────────────────────────────
// KuCoin
// ─────────────────────────────────────────────
// Format: tradeCreatedAt,symbol,side,price,size,funds,fee,feeCurrency
// Also: oid,symbol,dealPrice,dealValue,amount,fee,feeCurrency,side,createdAt

function parseKucoin(text: string): CsvTrade[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  
  const headers = rows[0].map(normalizeHeader);
  const trades: CsvTrade[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue;
    
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => obj[h] = row[idx]);

    const dateStr = obj["tradecreatedat"] || obj["createdat"] || obj["created_at"] || obj["time"] || "";
    const pairStr = obj["symbol"] || "";
    const sideStr = (obj["side"] || obj["direction"] || "").toUpperCase();
    
    if (!dateStr || !pairStr || !sideStr) continue;

    const { base, quote } = splitPair(pairStr.replace(/-/g, ""));
    const side = sideStr.includes("BUY") ? "buy" : "sell";

    const price = parseNumber(obj["price"] || obj["dealprice"]);
    const amount = parseNumber(obj["size"] || obj["amount"]);
    const total = parseNumber(obj["funds"] || obj["dealvalue"]) || (price * amount);
    const fee = parseNumber(obj["fee"]);
    const feeCurrency = obj["feecurrency"] || obj["fee_currency"] || quote;

    if (amount <= 0) continue;

    const dt = new Date(dateStr);

    trades.push({
      date: dt.toISOString().split("T")[0],
      datetime: dt.toISOString(),
      type: side,
      symbol: base,
      pair: pairStr,
      amount,
      price: price || (total / amount),
      total: total || (price * amount),
      fee,
      feeCurrency,
    });
  }

  return trades;
}

// ─────────────────────────────────────────────
// MEXC
// ─────────────────────────────────────────────
// Spot: Pairs,Time,Side,Filled Price,Executed Amount,Total,Fee
// Also: Symbol,Trade Time,Direction,Price,Quantity,Amount,Fee,Fee Coin

function parseMexc(text: string): CsvTrade[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  
  const headers = rows[0].map(normalizeHeader);
  const trades: CsvTrade[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue;
    
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => obj[h] = row[idx]);

    const dateStr = obj["time"] || obj["trade_time"] || obj["createtime"] || "";
    const pairStr = obj["pairs"] || obj["symbol"] || obj["pair"] || "";
    const sideStr = (obj["side"] || obj["direction"] || obj["type"] || "").toUpperCase();
    
    if (!dateStr || !pairStr) continue;
    if (!sideStr.includes("BUY") && !sideStr.includes("SELL")) continue;

    const cleanPair = pairStr.replace(/[-_/]/g, "");
    const { base, quote } = splitPair(cleanPair);
    const side = sideStr.includes("BUY") ? "buy" : "sell";

    const price = parseNumber(obj["filled_price"] || obj["price"]);
    const amount = parseNumber(obj["executed_amount"] || obj["quantity"] || obj["amount"]);
    const total = parseNumber(obj["total"] || obj["amount_quote"]) || (price * amount);
    const fee = parseNumber(obj["fee"]);
    const feeCurrency = obj["fee_coin"] || obj["fee_currency"] || quote;

    if (amount <= 0) continue;

    const dt = new Date(dateStr);

    trades.push({
      date: dt.toISOString().split("T")[0],
      datetime: dt.toISOString(),
      type: side,
      symbol: base,
      pair: pairStr,
      amount,
      price: price || (total / amount),
      total: total || (price * amount),
      fee,
      feeCurrency,
    });
  }

  return trades;
}

// ─────────────────────────────────────────────
// Auto-detect & parse
// ─────────────────────────────────────────────

const PARSERS: Record<string, (text: string) => CsvTrade[]> = {
  binance: parseBinance,
  kucoin: parseKucoin,
  mexc: parseMexc,
};

/**
 * Parse CSV for a specific exchange slug.
 * Falls back to auto-detect if slug is unknown.
 */
export function parseCsvTrades(csvText: string, exchangeSlug: string): CsvTrade[] {
  const parser = PARSERS[exchangeSlug];
  if (parser) return parser(csvText);

  // Try all parsers, return whichever produces results
  for (const [, p] of Object.entries(PARSERS)) {
    const result = p(csvText);
    if (result.length > 0) return result;
  }

  return [];
}

export function supportedCsvExchanges(): string[] {
  return Object.keys(PARSERS);
}
