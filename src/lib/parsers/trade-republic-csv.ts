import { ISIN_MAP } from "@/lib/isin-map";

export interface CsvSecurityPosition {
  symbol: string;
  name: string;
  isin: string;
  quantity: number;
  priceEur: number;
  valueEur: number;
}

export interface CsvCryptoPosition {
  symbol: string;
  name: string;
  quantity: number;
  priceEur: number;
  costEur: number;
  gainLoss: number;
  gainPct: number;
  valueEur: number;
}

export interface CsvBankTransaction {
  date: string;
  type: string;
  description: string;
  credit: number | null;
  debit: number | null;
  balance: number;
  externalId: string;
}

// Trades BUY/SELL normalizados, con principal separado de fee/tax.
// Usado por el matcher DCA para imputar la parte que efectivamente va al
// activo (target = 450€/mes se refiere a principal, no a principal+fees).
export interface CsvTrade {
  date: string;
  side: "buy" | "sell";
  isin: string;
  symbol: string; // symbol resuelto (ISIN_MAP) o ticker (crypto)
  assetClass: string;
  units: number;
  priceEur: number;
  principalEur: number; // |amount|, sin fees
  feeEur: number;
  taxEur: number;
  externalId: string;
}

export interface CsvParseResult {
  kind: "csv";
  securities: CsvSecurityPosition[];
  crypto: CsvCryptoPosition[];
  cashBalance: number;
  totalIn: number;
  totalOut: number;
  transactions: CsvBankTransaction[];
  trades: CsvTrade[];
  dateRange: string;
}

// Símbolos usados en las posiciones reconstruidas.
// Stocks/Funds: `symbol` del CSV trae el ISIN → mapea vía ISIN_MAP.
// Crypto: `symbol` del CSV ya es el ticker (BTC, ETH) → úsalo directo.
function symbolForRow(symbol: string, name: string, assetClass: string): string {
  if (assetClass === "CRYPTO") return symbol || name;
  if (ISIN_MAP[symbol]) return ISIN_MAP[symbol];
  return name.split(/[\s,]+/).slice(0, 2).join(" ") || symbol;
}

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function num(s: string): number {
  if (!s || s.trim() === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Clasifica el type del CSV TR a la taxonomía interna de bank_transactions.
function classifyCsvType(row: Record<string, string>): string {
  const t = row.type;
  switch (t) {
    case "BUY":
    case "SELL":
      return "trade";
    case "DIVIDEND":
      return "dividend";
    case "INTEREST_PAYMENT":
      return "interest";
    case "CARD_TRANSACTION":
      return "card_payment";
    case "GIFT":
      return "gift";
    case "CUSTOMER_INBOUND":
    case "TRANSFER_INBOUND":
    case "TRANSFER_INSTANT_INBOUND":
      return "transfer_in";
    case "TRANSFER_INSTANT_OUTBOUND":
    case "TRANSFER_OUTBOUND":
      return "transfer_out";
    case "MIGRATION":
      return "migration";
    default:
      return "other";
  }
}

// cashDelta: impacto neto en cash por transacción.
// amount ya viene neto para la mayoría (BUY incluye principal en negativo).
// fee y tax son movimientos adicionales sobre el cash.
function cashDelta(row: Record<string, string>): number {
  if (row.type === "MIGRATION") return 0;
  return num(row.amount) + num(row.fee) + num(row.tax);
}

function buildDescription(row: Record<string, string>): string {
  const parts: string[] = [];
  if (row.description) parts.push(row.description);
  else if (row.name) parts.push(row.name);
  if (row.symbol && !parts[0]?.includes(row.symbol)) parts.push(row.symbol);
  const desc = parts.join(" — ").trim();
  return desc.substring(0, 500);
}

export function parseTradeRepublicCsv(text: string): CsvParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("CSV vacío o sin cabecera");
  }
  const header = parseCsvRow(lines[0]).map((h) => h.replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]).map((c) => c.replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }

  // Orden temporal estable (el CSV de TR suele venir ordenado por datetime).
  rows.sort((a, b) => (a.datetime > b.datetime ? 1 : a.datetime < b.datetime ? -1 : 0));

  // Reconstrucción posiciones por ISIN/símbolo (MIGRATION neutraliza a 0 naturalmente).
  const byIsin = new Map<
    string,
    {
      isin: string;
      name: string;
      assetClass: string;
      shares: number;
      lastPrice: number;
      lastDate: string;
    }
  >();

  let cash = 0;
  let totalIn = 0;
  let totalOut = 0;
  const transactions: CsvBankTransaction[] = [];
  const trades: CsvTrade[] = [];

  for (const row of rows) {
    const delta = cashDelta(row);
    cash = Math.round((cash + delta) * 100) / 100;
    if (delta > 0) totalIn += delta;
    else if (delta < 0) totalOut += -delta;

    // Acumulación shares por ISIN. Solo mueven posición: BUY, SELL, MIGRATION.
    // DIVIDEND trae shares como referencia (unidades que generaron el pago), no se suma.
    const isin = row.symbol;
    const movesShares = row.type === "BUY" || row.type === "SELL" || row.type === "MIGRATION";
    if (
      isin &&
      movesShares &&
      (row.asset_class === "STOCK" || row.asset_class === "FUND" || row.asset_class === "CRYPTO")
    ) {
      const existing = byIsin.get(isin);
      const shares = num(row.shares);
      const price = num(row.price);
      if (existing) {
        existing.shares = Math.round((existing.shares + shares) * 1e10) / 1e10;
        if (price > 0 && row.date >= existing.lastDate) {
          existing.lastPrice = price;
          existing.lastDate = row.date;
        }
      } else {
        byIsin.set(isin, {
          isin,
          name: row.name || isin,
          assetClass: row.asset_class,
          shares: Math.round(shares * 1e10) / 1e10,
          lastPrice: price,
          lastDate: row.date,
        });
      }
    }

    // BUY/SELL: registrar el trade con principal separado de fee/tax.
    if ((row.type === "BUY" || row.type === "SELL") && isin) {
      const resolvedSymbol = symbolForRow(isin, row.name, row.asset_class);
      trades.push({
        date: row.date,
        side: row.type === "BUY" ? "buy" : "sell",
        isin,
        symbol: resolvedSymbol,
        assetClass: row.asset_class,
        units: Math.abs(num(row.shares)),
        priceEur: num(row.price),
        principalEur: Math.abs(num(row.amount)),
        feeEur: Math.abs(num(row.fee)),
        taxEur: Math.abs(num(row.tax)),
        externalId: row.transaction_id,
      });
    }

    const type = classifyCsvType(row);
    if (type !== "migration") {
      const description = buildDescription(row);
      transactions.push({
        date: row.date,
        type,
        description,
        credit: delta > 0 ? Math.round(delta * 100) / 100 : null,
        debit: delta < 0 ? Math.round(-delta * 100) / 100 : null,
        balance: cash,
        externalId: row.transaction_id,
      });
    }
  }

  const securities: CsvSecurityPosition[] = [];
  const crypto: CsvCryptoPosition[] = [];
  for (const p of byIsin.values()) {
    // Posiciones cerradas (ventas a 0) quedan filtradas con epsilon.
    if (Math.abs(p.shares) < 1e-8) continue;
    const valueEur = Math.round(p.shares * p.lastPrice * 100) / 100;
    const symbol = symbolForRow(p.isin, p.name, p.assetClass);
    if (p.assetClass === "CRYPTO") {
      crypto.push({
        symbol,
        name: p.name,
        quantity: p.shares,
        priceEur: p.lastPrice,
        costEur: 0,
        gainLoss: 0,
        gainPct: 0,
        valueEur,
      });
    } else {
      securities.push({
        symbol,
        name: p.name,
        isin: p.isin,
        quantity: p.shares,
        priceEur: p.lastPrice,
        valueEur,
      });
    }
  }

  const dateRange = rows.length
    ? `${rows[0].date} - ${rows[rows.length - 1].date}`
    : "";

  return {
    kind: "csv",
    securities,
    crypto,
    cashBalance: cash,
    totalIn: Math.round(totalIn * 100) / 100,
    totalOut: Math.round(totalOut * 100) / 100,
    transactions,
    trades,
    dateRange,
  };
}
