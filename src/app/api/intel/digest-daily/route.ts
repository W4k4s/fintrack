import { NextRequest, NextResponse } from "next/server";
import {
  buildDailyDigest,
  formatDailyDigest,
  isWeekdayMadrid,
} from "@/lib/intel/digest-daily";
import { tgSend } from "@/lib/intel/telegram";

/**
 * Daily pre-open briefing endpoint.
 *
 *  GET  /api/intel/digest-daily?dry=1   → devuelve el texto sin enviar.
 *  GET  /api/intel/digest-daily         → devuelve JSON con context.
 *  POST /api/intel/digest-daily         → envía a Telegram SOLO si L-V (Madrid).
 *  POST /api/intel/digest-daily?force=1 → envía aunque sea finde (debug).
 *
 * El timer systemd `fintrack-intel-digest-daily.timer` llama al POST a las
 * 08:30 Europe/Madrid todos los días; el endpoint filtra el finde.
 */

export async function GET(req: NextRequest) {
  const ctx = await buildDailyDigest();
  if (req.nextUrl.searchParams.get("dry") === "1") {
    return new NextResponse(formatDailyDigest(ctx), {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.json({ text: formatDailyDigest(ctx), context: ctx });
}

export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!force && !isWeekdayMadrid()) {
    return NextResponse.json({ sent: false, reason: "weekend" });
  }
  const chatId = process.env.INTEL_TG_CHAT_ID;
  if (!chatId) {
    return NextResponse.json(
      { error: "INTEL_TG_CHAT_ID no definido" },
      { status: 500 },
    );
  }
  const ctx = await buildDailyDigest();
  const text = formatDailyDigest(ctx);
  const messageId = await tgSend(chatId, text);
  return NextResponse.json({
    sent: Boolean(messageId),
    messageId,
    length: text.length,
    context: ctx,
  });
}
