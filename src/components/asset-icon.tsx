"use client";
import { useState } from "react";

const COIN_CDN = "https://assets.coincap.io/assets/icons";

// Color palette for fallback initials — darkened to keep 4.5:1 vs white text.
const COLORS = [
  "#047857", "#1d4ed8", "#b45309", "#b91c1c", "#6d28d9",
  "#be185d", "#0e7490", "#c2410c", "#0f766e", "#4338ca",
];

function getColor(symbol: string) {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function AssetIcon({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const s = symbol.toLowerCase();

  if (failed) {
    return (
      <div
        className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.45, background: getColor(symbol) }}
      >
        {symbol.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={`${COIN_CDN}/${s}@2x.png`}
      alt={symbol}
      width={size}
      height={size}
      className="rounded-full shrink-0"
      onError={() => setFailed(true)}
    />
  );
}
