import { NextRequest, NextResponse } from "next/server";
import { buildWeeklyDigest } from "@/lib/intel/digest-weekly";
import { tgSend } from "@/lib/intel/telegram";

/**
 * Weekly digest endpoint.
 *
 *  GET  /api/intel/digest-weekly?dry=1  → devuelve el texto sin enviar.
 *  POST /api/intel/digest-weekly         → construye y envía a Telegram.
 *
 * El timer systemd `fintrack-intel-digest-weekly.timer` llama al POST
 * los domingos a las 19:00 Europe/Madrid.
 */

export async function GET(req: NextRequest) {
  const digest = await buildWeeklyDigest();
  if (req.nextUrl.searchParams.get("dry") === "1") {
    return new NextResponse(digest.text, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.json(digest);
}

export async function POST() {
  const chatId = process.env.INTEL_TG_CHAT_ID;
  if (!chatId) {
    return NextResponse.json(
      { error: "INTEL_TG_CHAT_ID no definido" },
      { status: 500 },
    );
  }
  const digest = await buildWeeklyDigest();
  const messageId = await tgSend(chatId, digest.text);
  return NextResponse.json({
    sent: Boolean(messageId),
    messageId,
    length: digest.text.length,
    context: digest.context,
  });
}
