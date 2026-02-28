import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { ThemeInit } from "@/components/theme-init";
import { CurrencyProvider } from "@/components/currency-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "FinTrack — Portfolio Tracker",
  description: "Track your crypto, stocks, and savings in one place",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans bg-background text-foreground min-h-screen antialiased`}>
        <ThemeInit />
        <CurrencyProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto">
              <div className="max-w-7xl mx-auto p-6 md:p-8">{children}</div>
            </main>
          </div>
        </CurrencyProvider>
      </body>
    </html>
  );
}
