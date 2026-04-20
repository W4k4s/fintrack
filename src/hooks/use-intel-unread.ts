"use client";

import { useEffect, useState, useCallback } from "react";

type UnreadState = {
  count: number;
  refresh: () => Promise<void>;
};

export function useIntelUnread(pollMs = 60_000): UnreadState {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/intel?status=unread&limit=1", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setCount(Number(data.unreadCount || 0));
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      await refresh();
    };
    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refresh, pollMs]);

  return { count, refresh };
}
