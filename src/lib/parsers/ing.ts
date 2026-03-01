import * as XLSX from "xlsx";

export interface INGTransaction {
  date: string;        // YYYY-MM-DD
  category: string;
  subcategory: string;
  description: string;
  comment: string;
  amount: number;      // negative = expense, positive = income
  balance: number;
  type: string;        // expense, income, transfer_in, transfer_out, savings, other
}

export interface INGParseResult {
  accountNumber: string;
  holder: string;
  exportDate: string;
  transactions: INGTransaction[];
}

function excelDateToISO(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

function classifyINGTransaction(category: string, _subcategory: string, description: string, amount: number): string {
  const cat = category.toLowerCase();
  const desc = description.toLowerCase();

  if (cat.includes("ahorro") || (desc.includes("traspaso emitido") && desc.includes("ahorro"))) return "savings";
  if (desc.includes("traspaso emitido")) return "transfer_out";
  if (desc.includes("traspaso recibido")) return "transfer_in";
  if (desc.includes("transferencia emitida")) return "transfer_out";
  if (desc.includes("transferencia recibida")) return "transfer_in";
  if (cat.includes("nómina") || cat.includes("otros ingresos")) return "income";
  if (amount > 0) return "income";
  return "expense";
}

export function parseINGExcel(buffer: Buffer): INGParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });

  // Extract metadata from header rows
  const accountNumber = String(rows[0]?.[3] || "").trim();
  const holder = String(rows[1]?.[3] || "").trim();
  const exportDate = String(rows[2]?.[3] || "").trim();

  // Find header row (F. VALOR)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (String(rows[i]?.[0]).includes("F. VALOR")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error("Could not find ING header row (F. VALOR)");

  const transactions: INGTransaction[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const dateVal = row[0];
    let date: string;
    if (typeof dateVal === "number") {
      date = excelDateToISO(dateVal);
    } else {
      const parts = String(dateVal).split("/");
      if (parts.length === 3) {
        date = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      } else {
        date = String(dateVal);
      }
    }

    const category = String(row[1] || "").trim();
    const subcategory = String(row[2] || "").trim();
    const description = String(row[3] || "").trim();
    const comment = String(row[4] || "").trim();
    const amount = typeof row[5] === "number" ? row[5] : parseFloat(String(row[5]).replace(",", ".")) || 0;
    const balance = typeof row[6] === "number" ? row[6] : parseFloat(String(row[6]).replace(",", ".")) || 0;

    const type = classifyINGTransaction(category, subcategory, description, amount);

    transactions.push({ date, category, subcategory, description, comment, amount, balance, type });
  }

  return { accountNumber, holder, exportDate, transactions };
}
