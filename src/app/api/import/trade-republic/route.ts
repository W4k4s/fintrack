import { NextRequest, NextResponse } from "next/server";
import { parseTradeRepublicPDF, ParseResult } from "@/lib/parsers/trade-republic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const results: ParseResult[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await parseTradeRepublicPDF(buffer);
      results.push(result);
    }

    const securities = results.filter(r => r.kind === "securities").flatMap(r => r.kind === "securities" ? r.positions : []);
    const crypto = results.filter(r => r.kind === "crypto").flatMap(r => r.kind === "crypto" ? r.positions : []);
    const bankStatement = results.find(r => r.kind === "bank_statement");

    return NextResponse.json({
      securities,
      crypto,
      cashBalance: bankStatement?.kind === "bank_statement" ? bankStatement.cashBalance : null,
      totalIn: bankStatement?.kind === "bank_statement" ? bankStatement.totalIn : null,
      totalOut: bankStatement?.kind === "bank_statement" ? bankStatement.totalOut : null,
      transactions: bankStatement?.kind === "bank_statement" ? bankStatement.transactions : [],
      transactionCount: bankStatement?.kind === "bank_statement" ? bankStatement.transactions.length : 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
