import pdf from "pdf-parse";

const ISIN_MAP: Record<string, string> = {
  "IE00B4L5Y983": "MSCI World",
  "IE00B0M62X26": "EU Infl Bond",
  "IE00B579F325": "Gold ETC",
  "IE00BP3QZ825": "MSCI Momentum",
  "US5949181045": "MSFT",
  "US67066G1040": "NVDA",
  "ES0113900J37": "SAN",
  "XF000BTC0017": "BTC",
};

export interface SecurityPosition {
  symbol: string; name: string; isin: string;
  quantity: number; priceEur: number; valueEur: number;
}
export interface CryptoPosition {
  symbol: string; name: string; quantity: number;
  priceEur: number; costEur: number; gainLoss: number; gainPct: number; valueEur: number;
}
export interface BankTransaction {
  date: string; type: string; description: string;
  credit: number | null; debit: number | null; balance: number;
}
export interface SecuritiesResult { kind: "securities"; positions: SecurityPosition[]; total: number; date: string; }
export interface CryptoResult { kind: "crypto"; positions: CryptoPosition[]; total: number; date: string; }
export interface BankStatementResult { kind: "bank_statement"; cashBalance: number; totalIn: number; totalOut: number; transactions: BankTransaction[]; dateRange: string; }
export type ParseResult = SecuritiesResult | CryptoResult | BankStatementResult;

function parseEurNum(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

function parseDate(s: string): string {
  const months: Record<string, string> = {
    ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
    jul: "07", ago: "08", sept: "09", sep: "09", oct: "10", nov: "11", dic: "12",
  };
  const dotMatch = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dotMatch) return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`;
  const spanishMatch = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (spanishMatch) {
    const m = months[spanishMatch[2].toLowerCase()] || "01";
    return `${spanishMatch[3]}-${m}-${spanishMatch[1].padStart(2, "0")}`;
  }
  return s;
}

function symbolFromIsin(isin: string, name: string): string {
  if (ISIN_MAP[isin]) return ISIN_MAP[isin];
  return name.split(/[\s,]+/).slice(0, 2).join(" ") || isin;
}

function detectType(text: string): "securities" | "crypto" | "bank_statement" {
  if (text.includes("EXTRACTO DE CRIPTOMONEDAS")) return "crypto";
  if (text.includes("EXTRACTO DE LA CUENTA DE VALORES")) return "securities";
  if (text.includes("RESUMEN DE ESTADO DE CUENTA") || text.includes("TRANSACCIONES DE CUENTA")) return "bank_statement";
  throw new Error("Unknown Trade Republic PDF type");
}

function parseSecurities(text: string): SecuritiesResult {
  const positions: SecurityPosition[] = [];
  const dateMatch = text.match(/FECHA\s*\n\s*(\d{2}\.\d{2}\.\d{4})/);
  const date = dateMatch ? parseDate(dateMatch[1]) : "";

  const posRegex = /(\d[\d,.]*)\s*tít\.([\s\S]*?)ISIN:\s*([A-Z]{2}[A-Z0-9]{10})([\s\S]*?)(?=\d[\d,.]*\s*tít\.|NÚMERO DE POSICIONES)/g;
  let m;
  while ((m = posRegex.exec(text)) !== null) {
    const name = m[2].replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    const afterIsin = m[4];
    const nums = afterIsin.match(/([\d.,]+)\s*\n\s*\d{2}\.\d{2}\.\d{4}\s*\n\s*([\d.,]+)/);
    if (nums) {
      positions.push({
        symbol: symbolFromIsin(m[3], name),
        name, isin: m[3],
        quantity: parseEurNum(m[1]),
        priceEur: parseEurNum(nums[1]),
        valueEur: parseEurNum(nums[2]),
      });
    }
  }
  const totalMatch = text.match(/NÚMERO DE POSICIONES:\s*\d+\s*([\d.,]+)\s*EUR/);
  const total = totalMatch ? parseEurNum(totalMatch[1]) : positions.reduce((s, p) => s + p.valueEur, 0);
  return { kind: "securities", positions, total, date };
}

function parseCrypto(text: string): CryptoResult {
  const positions: CryptoPosition[] = [];
  const dateMatch = text.match(/a fecha\s*(\d{2}\.\d{2}\.\d{4})/);
  const date = dateMatch ? parseDate(dateMatch[1]) : "";

  const posRegex = /([\d,.]+)\s*tít\.\s*(\w+)\s*\((\w+)\)\s*([\d.,]+)\s*\n\s*\d{2}\.\d{2}\.\d{4}\s*\n\s*([\d.,]+)\s*([-\d.,]+)\s*\n\s*(-?[\d.,]+)%\s*\n\s*([\d.,]+)/g;
  let m;
  while ((m = posRegex.exec(text)) !== null) {
    positions.push({
      symbol: m[2] === "Bitcoin" ? "BTC" : m[2],
      name: m[3], quantity: parseEurNum(m[1]),
      priceEur: parseEurNum(m[4]), costEur: parseEurNum(m[5]),
      gainLoss: parseEurNum(m[6]), gainPct: parseEurNum(m[7]), valueEur: parseEurNum(m[8]),
    });
  }
  const totalMatch = text.match(/VALORES DE MERCADO TOTALES:\s*([\d.,]+)\s*€/);
  const total = totalMatch ? parseEurNum(totalMatch[1]) : positions.reduce((s, p) => s + p.valueEur, 0);
  return { kind: "crypto", positions, total, date };
}

function classifyTransaction(type: string, description: string): string {
  const t = type.toLowerCase();
  const d = description.toLowerCase();
  if (t === "operar") return "trade";
  if (t === "interés" || t === "intereses") return "interest";
  if (t === "rentabilidad" || d.includes("dividend")) return "dividend";
  if (t === "transacción con tarjeta") return "card_payment";
  if (t === "regalo") return "gift";
  if (t === "transferencia") {
    if (d.includes("incoming") || d.includes("ingreso")) return "transfer_in";
    if (d.includes("outgoing")) return "transfer_out";
    return "transfer_in";
  }
  return "other";
}

function parseBankStatement(text: string): BankStatementResult {
  const transactions: BankTransaction[] = [];
  const balanceMatch = text.match(/Cuenta corriente\s*([\d.,]+)\s*€\s*([\d.,]+)\s*€\s*([\d.,]+)\s*€\s*([\d.,]+)\s*€/);
  const cashBalance = balanceMatch ? parseEurNum(balanceMatch[4]) : 0;
  const totalIn = balanceMatch ? parseEurNum(balanceMatch[2]) : 0;
  const totalOut = balanceMatch ? parseEurNum(balanceMatch[3]) : 0;
  const dateRangeMatch = text.match(/FECHA\s*\n\s*([\d\w\s]+-[\d\w\s]+\d{4})/);
  const dateRange = dateRangeMatch ? dateRangeMatch[1].trim() : "";

  let txSection = text.split("TRANSACCIONES DE CUENTA")[1]?.split("RESUMEN DEL BALANCE")[0] || "";
  txSection = txSection.replace(/TRADE REPUBLIC BANK[\s\S]*?Página\s+\d+de\d+/g, "");
  txSection = txSection.replace(/FECHA\s*TIPO\s*DESCRIPCIÓN[\s\S]*?BALANCE/g, "");

  const txTypes = ["Transferencia", "Operar", "Interés", "Intereses", "Rentabilidad", "Transacción con tarjeta", "Regalo"];
  const txTypePattern = txTypes.join("|");

  const dateTypeRegex = new RegExp(
    `(\\d{1,2}\\s+\\w+\\s*\\n\\s*\\d{4})\\s*\\n(${txTypePattern})([\\s\\S]*?)(?=\\d{1,2}\\s+\\w+\\s*\\n\\s*\\d{4}\\s*\\n(?:${txTypePattern})|$)`,
    "g"
  );

  let match;
  while ((match = dateTypeRegex.exec(txSection)) !== null) {
    const rawDate = match[1].replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    const type = match[2].trim();
    let rest = match[3].trim();

    // For trades: "quantity: 0.760332" gets concatenated with the EUR amount
    // Strip the quantity number that's glued to the amount
    // Pattern: "quantity: X.XXXXXX" followed immediately by EUR amount
    // In the PDF text: "quantity: 0.76033275,98 €" — the "75,98 €" is the amount
    // We need to detect this: after "quantity:" there's a number that may run into the EUR amount
    const qtyGlueMatch = rest.match(/quantity:\s*([\d.]+?)(\d{1,3},\d{2}\s*€)/);
    if (qtyGlueMatch) {
      // Fix: insert a space/separator so amounts parse correctly
      rest = rest.replace(qtyGlueMatch[0], `quantity: ${qtyGlueMatch[1]} ${qtyGlueMatch[2]}`);
    }

    // Also handle "quantity: 165998,77 €" where 165 is the quantity and 998,77 is the amount
    // Detect: last EUR amount is always the balance line amount
    // Simpler approach: find all proper EUR amounts (X.XXX,XX € or XXX,XX €)
    // by working backwards from the end
    
    const amountStrs: { val: number; idx: number; len: number }[] = [];
    const amtRegex = /(?<!\d)([\d.]+,\d{2})\s*€/g;
    let am;
    while ((am = amtRegex.exec(rest)) !== null) {
      amountStrs.push({ val: parseEurNum(am[1]), idx: am.index, len: am[0].length });
    }

    const firstIdx = amountStrs.length > 0 ? amountStrs[0].idx : rest.length;
    let description = rest.substring(0, firstIdx).replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    
    // Clean up description: remove trailing partial numbers from quantity glue
    description = description.replace(/\s*[\d.]+\s*$/, "").trim();

    const balance = amountStrs.length > 0 ? amountStrs[amountStrs.length - 1].val : 0;
    const txType = classifyTransaction(type, description);

    let credit: number | null = null;
    let debit: number | null = null;

    if (amountStrs.length >= 2) {
      const amount = amountStrs[amountStrs.length - 2].val;
      if (["transfer_in", "interest", "dividend", "gift"].includes(txType) ||
          (txType === "trade" && description.toLowerCase().includes("sell"))) {
        credit = amount;
      } else {
        debit = amount;
      }
    }

    transactions.push({
      date: parseDate(rawDate),
      type: txType,
      description: description.substring(0, 500),
      credit, debit, balance,
    });
  }

  return { kind: "bank_statement", cashBalance, totalIn, totalOut, transactions, dateRange };
}

export async function parseTradeRepublicPDF(buffer: Buffer): Promise<ParseResult> {
  const data = await pdf(buffer);
  const type = detectType(data.text);
  switch (type) {
    case "securities": return parseSecurities(data.text);
    case "crypto": return parseCrypto(data.text);
    case "bank_statement": return parseBankStatement(data.text);
  }
}
