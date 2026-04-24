import { NextResponse } from "next/server";
import { getDashboardSummary } from "@/lib/dashboard/summary";

export async function GET() {
  return NextResponse.json(await getDashboardSummary());
}
