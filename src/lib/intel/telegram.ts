import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { isQuietHourMadrid } from "./tz";
import { getActiveCooldown } from "./cooldowns";

/**
 * Envía notificación Telegram asociada a una signal. Respeta quiet hours
 * (23:00–08:00 Madrid) salvo que severity=critical.
 *
 * Token y chat_id leídos de env:
 *   - INTEL_TG_BOT_TOKEN  (compartido con bot IsmaClaw idealmente)
 *   - INTEL_TG_CHAT_ID    (chat del usuario, ej 123456789)
 */

const TG_API = "https://api.telegram.org";

export async function tgSend(chatId: string, text: string): Promise<string | null> {
  const token = process.env.INTEL_TG_BOT_TOKEN;
  if (!token) {
    console.warn("[intel] INTEL_TG_BOT_TOKEN no definido; skip send");
    return null;
  }
  try {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error("[intel] telegram send failed", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data?.result?.message_id ? String(data.result.message_id) : null;
  } catch (err) {
    console.error("[intel] telegram send error", err);
    return null;
  }
}

export async function sendIntelNotification(
  signalId: number,
  text: string,
): Promise<void> {
  const chatId = process.env.INTEL_TG_CHAT_ID;
  if (!chatId) {
    console.warn("[intel] INTEL_TG_CHAT_ID no definido; skip");
    return;
  }

  const [sig] = await db
    .select()
    .from(schema.intelSignals)
    .where(eq(schema.intelSignals.id, signalId))
    .limit(1);
  if (!sig) return;

  const now = new Date();
  const quiet = isQuietHourMadrid(now);
  const forceSend = sig.severity === "critical";

  if (quiet && !forceSend) {
    await db.insert(schema.intelNotifications).values({
      signalId,
      channel: "telegram",
      status: "suppressed",
      suppressionReason: "quiet_hours",
      payload: text,
    });
    return;
  }

  if (!forceSend) {
    const cooldownUntil = await getActiveCooldown(sig.scope, now);
    if (cooldownUntil) {
      await db.insert(schema.intelNotifications).values({
        signalId,
        channel: "telegram",
        status: "suppressed",
        suppressionReason: "scope_cooldown",
        payload: text,
      });
      return;
    }
  }

  const messageId = await tgSend(chatId, text);
  await db.insert(schema.intelNotifications).values({
    signalId,
    channel: "telegram",
    status: messageId ? "sent" : "failed",
    telegramMessageId: messageId ?? undefined,
    payload: text,
    sentAt: messageId ? new Date().toISOString() : undefined,
  });
}
