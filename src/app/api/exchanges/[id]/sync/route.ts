import { NextRequest, NextResponse } from "next/server";
import { syncExchange } from "@/lib/exchanges";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await syncExchange(parseInt(id));
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
