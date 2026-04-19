import type { IntelRebalanceOrder } from "@/lib/db/schema";
import { tgSend } from "@/lib/intel/telegram";

/**
 * Envía un único mensaje Telegram resumiendo los auto-matches de un batch de
 * imports/sync. No envía si matched=0. Best-effort: errores de red no abortan
 * el import.
 */
export async function notifyAutoMatched(
  matched: IntelRebalanceOrder[],
  ambiguous: number,
  source: string,
): Promise<void> {
  if (matched.length === 0 && ambiguous === 0) return;

  const lines: string[] = [];
  if (matched.length > 0) {
    lines.push(`✅ ${matched.length} órdenes del plan detectadas (${source})`);
    for (const m of matched.slice(0, 8)) {
      const amt = Math.round(m.actualAmountEur ?? m.amountEur);
      lines.push(`• ${m.type} ${m.assetSymbol} ${amt}€ @ ${m.venue}`);
    }
    if (matched.length > 8) lines.push(`… y ${matched.length - 8} más`);
  }
  if (ambiguous > 0) {
    lines.push(
      `⚠️ ${ambiguous} trade${ambiguous === 1 ? "" : "s"} con >1 order pendiente candidata — revisa manual en /intel`,
    );
  }

  const chatId = process.env.INTEL_TG_CHAT_ID;
  if (!chatId) return;
  try {
    await tgSend(chatId, lines.join("\n"));
  } catch (err) {
    console.error("[auto-match-notifier] tgSend failed", err);
  }
}
