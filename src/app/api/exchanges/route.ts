import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/crypto/encryption";
import { getExchangeInfo } from "@/lib/exchanges/registry";

export async function GET() {
  const exchanges = await db.query.exchanges.findMany();
  // Strip encrypted fields
  const safe = exchanges.map(({ apiKey, apiSecret, passphrase, ...rest }) => ({
    ...rest,
    hasApiKey: !!apiKey,
    hasApiSecret: !!apiSecret,
    hasPassphrase: !!passphrase,
  }));
  return NextResponse.json(safe);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, apiKey, apiSecret, passphrase } = body;

  const info = getExchangeInfo(slug);
  if (!info) return NextResponse.json({ error: "Unknown exchange" }, { status: 400 });

  const [exchange] = await db.insert(schema.exchanges).values({
    name: info.name,
    slug,
    type: info.type,
    apiKey: apiKey ? encrypt(apiKey) : null,
    apiSecret: apiSecret ? encrypt(apiSecret) : null,
    passphrase: passphrase ? encrypt(passphrase) : null,
  }).returning();

  return NextResponse.json({ id: exchange.id, name: exchange.name, slug: exchange.slug });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await db.delete(schema.exchanges).where(eq(schema.exchanges.id, id));
  return NextResponse.json({ ok: true });
}
