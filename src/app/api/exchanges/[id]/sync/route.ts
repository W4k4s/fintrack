import { NextRequest, NextResponse } from "next/server";
import { syncExchange } from "@/lib/exchanges";
import { matchTradesToDCA } from "@/lib/dca-matcher";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await syncExchange(parseInt(id));
    // Auto-match new trades to DCA plans
    const dcaResult = await matchTradesToDCA();
    return NextResponse.json({ ...result, dca: dcaResult });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
