/**
 * CSV / spreadsheet parsers for exchange transaction-history imports.
 *
 * Each parser normalizes the exchange-specific layout into a common
 * `CsvTransaction` shape that matches the `transactions` schema. Parsers operate
 * on `string[][]` rows (row 0 = header) so the same code serves both CSV
 * (`parseCsvRows`) and XLSX (`parseXlsxRows`, see `./xlsx-rows`).
 */

export interface CsvTransaction {
  date: string;        // YYYY-MM-DD
  datetime: string;    // ISO string for dedup precision
  type: "buy" | "sell" | "deposit" | "withdrawal";
  symbol: string;      // base asset (e.g. "BTC")
  pair: string;        // original pair / asset label (e.g. "BTCUSDT", "BTC")
  amount: number;      // quantity of base asset
  price: number | null;  // price per unit in quote currency (null for non-trades)
  total: number | null;  // amount * price in quote currency (null for non-trades)
  quoteCurrency: string; // quote asset of the pair; = symbol for non-trades
  fee: number;
  feeCurrency: string;
  notes?: string;      // extra context for non-trades (network, txid, airdrop…)
}

/** @deprecated kept for compatibility — use {@link CsvTransaction}. */
export type CsvTrade = CsvTransaction;

/**
 * Parse a CSV string into rows. Handles quoted fields with commas inside.
 */
export function parseCsvRows(text: string): string[][] {
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
  return String(h).replace(/﻿/g, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
}

function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(String(val).replace(/,/g, "")) || 0;
}

/** Trailing currency code embedded in a fee cell, e.g. "0.159788225USDT" → "USDT". */
function extractCurrency(raw: string | undefined): string {
  if (!raw) return "";
  const m = String(raw).trim().match(/([A-Za-z]{2,})\s*$/);
  return m ? m[1].toUpperCase() : "";
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

/** Build a header→value lookup for a data row, tolerating ragged rows. */
function rowToObj(headers: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((h, idx) => { obj[h] = row[idx] ?? ""; });
  return obj;
}

// ─────────────────────────────────────────────
// Binance
// ─────────────────────────────────────────────
// Format variants:
// 1. Trade History: Date(UTC),Pair,Side,Price,Executed,Amount,Fee
// 2. Order History: Date(UTC),OrderNo,Pair,Type,Side,Order Price,Order Amount,Avg Trading Price,Filled,Total,status
// 3. Newer: Date(UTC),Market,Type,Price,Amount,Total,Fee,Fee Coin

function parseBinance(rows: string[][]): CsvTransaction[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  const trades: CsvTransaction[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue;

    const obj = rowToObj(headers, row);

    const dateStr = obj["date_utc_"] || obj["date_utc"] || obj["date"] || obj["time"] || "";
    const pairStr = obj["pair"] || obj["market"] || obj["symbol"] || "";
    const sideStr = (obj["side"] || obj["type"] || "").toUpperCase();

    if (!dateStr || !pairStr || !sideStr) continue;

    const { base, quote } = splitPair(pairStr.replace(/[-_/]/g, ""));
    const side = sideStr.includes("BUY") ? "buy" : "sell";

    const price = parseNumber(obj["price"] || obj["avg_trading_price"] || obj["order_price"]);
    const amount = parseNumber(obj["executed"] || obj["filled"] || obj["amount"] || obj["qty"]);
    // "Amount" in Binance trade history is the total (quote), "Executed" is the qty (base)
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
      quoteCurrency: quote,
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

function parseKucoin(rows: string[][]): CsvTransaction[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  const trades: CsvTransaction[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue;

    const obj = rowToObj(headers, row);

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
      quoteCurrency: quote,
      fee,
      feeCurrency,
    });
  }

  return trades;
}

// ─────────────────────────────────────────────
// MEXC
// ─────────────────────────────────────────────
// MEXC exports one spreadsheet PER category, each with a different schema (all
// start with a `UID` column). The export is localized: a Spanish export uses
// `Pares/Tiempo/Dirección/…` headers and `Compra`/`Venta` values. Files are
// dispatched by signature columns, NOT by position.
//
//  Trades:     UID,Pares,Tiempo,Dirección,Precio Completo,Monto Ejecutado,Total,Comisión,Rol
//  Deposits:   UID,Estado,Tiempo,Cripto,Red,Monto del Depósito,TxID,Progreso
//  Withdrawals:UID,Estado,Tiempo,Cripto,Red,Monto de Solicitud,Dirección de Retiro,memo,TxID,Comisión de Trading,…
//  Others:     UID,Tiempo,Cripto,Tipo,Cantidad,Estado,Observación   (airdrops, dust…)

/** Matches MEXC "completed" states across locales (Acreditado Correctamente, complete, success…). */
function mexcIsComplete(estado: string): boolean {
  if (!estado) return true; // some exports omit a state column
  return /acreditad|complet|success|done|finaliz|éxito|exito/i.test(estado);
}

function parseMexcTrades(rows: string[][], headers: string[]): CsvTransaction[] {
  const out: CsvTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !String(c).trim())) continue;
    const obj = rowToObj(headers, row);

    const dateStr = obj["tiempo"] || obj["fecha"] || obj["time"] || obj["trade_time"] || obj["createtime"] || "";
    const pairStr = obj["pares"] || obj["par"] || obj["symbol"] || obj["pair"] || "";
    const sideRaw = (obj["direcci_n"] || obj["direccion"] || obj["lado"] || obj["side"] || obj["type"] || "").toUpperCase();
    if (!dateStr || !pairStr) continue;

    const isBuy = sideRaw.includes("BUY") || sideRaw.includes("COMPRA");
    const isSell = sideRaw.includes("SELL") || sideRaw.includes("VENTA");
    if (!isBuy && !isSell) continue;
    const side = isBuy ? "buy" : "sell";

    const { base, quote } = splitPair(pairStr.replace(/[-_/]/g, ""));

    const price = parseNumber(obj["precio_completo"] || obj["precio"] || obj["filled_price"] || obj["price"]);
    const amount = parseNumber(obj["monto_ejecutado"] || obj["cantidad"] || obj["executed_amount"] || obj["quantity"] || obj["amount"]);
    const total = parseNumber(obj["total"] || obj["importe"] || obj["amount_quote"]) || (price * amount);

    const feeRaw = obj["comisi_n"] || obj["comision"] || obj["tarifa"] || obj["fee"] || "";
    const fee = parseNumber(feeRaw);
    const feeCurrency = extractCurrency(feeRaw) || obj["fee_coin"] || obj["fee_currency"] || quote;

    if (amount <= 0) continue;

    const dt = new Date(dateStr);

    out.push({
      date: dt.toISOString().split("T")[0],
      datetime: dt.toISOString(),
      type: side,
      symbol: base,
      pair: pairStr,
      amount,
      price: price || (total / amount),
      total: total || (price * amount),
      quoteCurrency: quote,
      fee,
      feeCurrency,
    });
  }
  return out;
}

function parseMexcDeposits(rows: string[][], headers: string[]): CsvTransaction[] {
  const out: CsvTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !String(c).trim())) continue;
    const obj = rowToObj(headers, row);

    if (!mexcIsComplete(obj["estado"] || obj["status"] || "")) continue;
    const symbol = (obj["cripto"] || obj["coin"] || obj["moneda"] || "").toUpperCase();
    const amount = parseNumber(obj["monto_del_dep_sito"] || obj["monto"] || obj["amount"]);
    const dateStr = obj["tiempo"] || obj["time"] || obj["fecha"] || "";
    if (!symbol || amount <= 0 || !dateStr) continue;

    const red = obj["red"] || obj["network"] || "";
    const txid = obj["txid"] || "";
    const dt = new Date(dateStr);

    out.push({
      date: dt.toISOString().split("T")[0],
      datetime: dt.toISOString(),
      type: "deposit",
      symbol,
      pair: symbol,
      amount,
      price: null,
      total: null,
      quoteCurrency: symbol,
      fee: 0,
      feeCurrency: symbol,
      notes: ["deposit", red, txid && `txid:${txid}`].filter(Boolean).join(" "),
    });
  }
  return out;
}

function parseMexcWithdrawals(rows: string[][], headers: string[]): CsvTransaction[] {
  const out: CsvTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !String(c).trim())) continue;
    const obj = rowToObj(headers, row);

    if (!mexcIsComplete(obj["estado"] || obj["status"] || "")) continue;
    const symbol = (obj["cripto"] || obj["coin"] || obj["moneda"] || "").toUpperCase();
    const amount = parseNumber(obj["monto_de_solicitud"] || obj["monto"] || obj["amount"]);
    const dateStr = obj["tiempo"] || obj["time"] || obj["fecha"] || "";
    if (!symbol || amount <= 0 || !dateStr) continue;

    const feeRaw = obj["comisi_n_de_trading"] || obj["comisi_n"] || obj["comision"] || obj["fee"] || "";
    const fee = parseNumber(feeRaw);
    const feeCurrency = extractCurrency(feeRaw) || symbol;
    const red = obj["red"] || obj["network"] || "";
    const dir = obj["direcci_n_de_retiro"] || obj["address"] || "";
    const txid = obj["txid"] || "";
    const dt = new Date(dateStr);

    out.push({
      date: dt.toISOString().split("T")[0],
      datetime: dt.toISOString(),
      type: "withdrawal",
      symbol,
      pair: symbol,
      amount,
      price: null,
      total: null,
      quoteCurrency: symbol,
      fee,
      feeCurrency,
      notes: ["withdrawal", red, dir, txid && `txid:${txid}`].filter(Boolean).join(" "),
    });
  }
  return out;
}

function parseMexcOthers(rows: string[][], headers: string[]): CsvTransaction[] {
  const out: CsvTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !String(c).trim())) continue;
    const obj = rowToObj(headers, row);

    if (!mexcIsComplete(obj["estado"] || obj["status"] || "")) continue;
    const symbol = (obj["cripto"] || obj["coin"] || obj["moneda"] || "").toUpperCase();
    const amount = parseNumber(obj["cantidad"] || obj["amount"] || obj["monto"]);
    const dateStr = obj["tiempo"] || obj["time"] || obj["fecha"] || "";
    if (!symbol || amount <= 0 || !dateStr) continue;

    const tipo = (obj["tipo"] || obj["type"] || "").trim();
    const obs = (obj["observaci_n"] || obj["observacion"] || obj["remark"] || "").trim();
    const isAirdrop = /airdrop/i.test(tipo);
    const notes = isAirdrop
      ? ["Airdrop", obs].filter(Boolean).join(" ")
      : [tipo || "other", obs].filter(Boolean).join(" ");
    const dt = new Date(dateStr);

    out.push({
      date: dt.toISOString().split("T")[0],
      datetime: dt.toISOString(),
      type: "deposit", // no dedicated enum; airdrops/dust recorded as deposits + note
      symbol,
      pair: symbol,
      amount,
      price: null,
      total: null,
      quoteCurrency: symbol,
      fee: 0,
      feeCurrency: symbol,
      notes,
    });
  }
  return out;
}

/**
 * Parse any MEXC export sheet. Dispatches by signature columns so column order
 * is irrelevant. Throws on an unrecognized header (fail loud) instead of
 * silently returning [] — that is what hid the original locale bug.
 */
export function parseMexcFile(rows: string[][]): CsvTransaction[] {
  if (rows.length < 1) return [];
  const headers = rows[0].map(normalizeHeader);
  const has = (h: string) => headers.includes(h);

  if (has("pares") || has("par")) return parseMexcTrades(rows, headers);
  if (has("monto_del_dep_sito")) return parseMexcDeposits(rows, headers);
  if (has("monto_de_solicitud") || has("direcci_n_de_retiro")) return parseMexcWithdrawals(rows, headers);
  if (has("tipo") && has("cantidad")) return parseMexcOthers(rows, headers);

  throw new Error(`Cabecera MEXC no reconocida: [${rows[0].join(", ")}]`);
}

// ─────────────────────────────────────────────
// Dispatch & dedup
// ─────────────────────────────────────────────

const PARSERS: Record<string, (rows: string[][]) => CsvTransaction[]> = {
  binance: parseBinance,
  kucoin: parseKucoin,
  mexc: parseMexcFile,
};

/**
 * Parse spreadsheet rows for a specific exchange slug.
 * Falls back to auto-detect (try each parser) if the slug is unknown.
 */
export function parseExchangeTransactions(rows: string[][], exchangeSlug: string): CsvTransaction[] {
  const parser = PARSERS[exchangeSlug];
  if (parser) return parser(rows);

  for (const p of Object.values(PARSERS)) {
    try {
      const result = p(rows);
      if (result.length > 0) return result;
    } catch {
      // parser rejected this layout — try the next
    }
  }
  return [];
}

/** @deprecated text wrapper around {@link parseExchangeTransactions}. */
export function parseCsvTrades(csvText: string, exchangeSlug: string): CsvTransaction[] {
  return parseExchangeTransactions(parseCsvRows(csvText), exchangeSlug);
}

export function supportedCsvExchanges(): string[] {
  return Object.keys(PARSERS);
}

/** Minimal shape needed from existing DB rows to dedup against. */
export interface ExistingTxKey {
  date: string;
  symbol: string;
  amount: number;
  price: number | null;
  type: string;
}

function dedupKey(t: { date: string; symbol: string; amount: number; price: number | null; type: string }): string {
  return `${t.date}|${t.symbol}|${t.amount}|${t.price ?? ""}|${t.type}`;
}

/**
 * Multiset dedup: skip a parsed row only if an *unmatched* identical row already
 * exists in the DB. Critical because MEXC emits byte-identical partial fills
 * (same date/symbol/amount/price/type) with no per-fill trade id — a set-based
 * key would collapse them and silently drop volume from the tax ledger.
 */
export function dedupeAgainstExisting(
  parsed: CsvTransaction[],
  existing: ExistingTxKey[],
): { toInsert: CsvTransaction[]; skipped: number } {
  const dbCount = new Map<string, number>();
  for (const e of existing) {
    const k = dedupKey(e);
    dbCount.set(k, (dbCount.get(k) ?? 0) + 1);
  }
  const consumed = new Map<string, number>();
  const toInsert: CsvTransaction[] = [];
  let skipped = 0;
  for (const t of parsed) {
    const k = dedupKey(t);
    const already = dbCount.get(k) ?? 0;
    const used = consumed.get(k) ?? 0;
    consumed.set(k, used + 1);
    if (used < already) { skipped++; continue; }
    toInsert.push(t);
  }
  return { toInsert, skipped };
}
