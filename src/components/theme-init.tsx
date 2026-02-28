"use client";

import { useEffect } from "react";

export function ThemeInit() {
  useEffect(() => {
    const saved = localStorage.getItem("fintrack-theme") || "dark";
    document.documentElement.className = saved === "light" ? "light" : "dark";
  }, []);
  return null;
}
