import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { BottomTabs } from "@/components/shell/bottom-tabs";
import { CommandPalette } from "@/components/shell/command-palette";
import { CommandPaletteProvider } from "@/components/shell/command-palette-context";
import { ThemeInit } from "@/components/theme-init";
import { CurrencyProvider } from "@/components/currency-provider";
import { PrivacyProvider } from "@/components/privacy-provider";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  axes: ["opsz"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FinTrack — Portfolio Tracker",
  description: "Track your crypto, stocks, and savings in one place",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} font-sans bg-background text-foreground min-h-screen antialiased`}
      >
        <ThemeInit />
        <PrivacyProvider>
        <CurrencyProvider>
          <CommandPaletteProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex-1 min-w-0 flex flex-col">
                <TopBar />
                <main className="flex-1 pb-[72px] md:pb-0">
                  <div className="max-w-7xl mx-auto px-4 py-4 md:px-8 md:py-8">
                    {children}
                  </div>
                </main>
              </div>
            </div>
            <BottomTabs />
            <CommandPalette />
          </CommandPaletteProvider>
        </CurrencyProvider>
        </PrivacyProvider>
      </body>
    </html>
  );
}
