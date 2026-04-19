import { NextRequest, NextResponse } from "next/server";
import { computeIntelMetrics } from "@/lib/intel/metrics";

export async function GET(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get("windowDays") ?? 30);
  const windowDays = Math.min(90, Math.max(1, Number.isFinite(raw) ? raw : 30));
  const metrics = await computeIntelMetrics(windowDays);
  return NextResponse.json(metrics);
}
