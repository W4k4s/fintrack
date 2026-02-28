import { NextResponse } from "next/server";
import { exchangeRegistry } from "@/lib/exchanges/registry";

export async function GET() {
  return NextResponse.json(exchangeRegistry);
}
