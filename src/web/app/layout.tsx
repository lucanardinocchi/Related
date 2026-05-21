import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Per src/web/CONTEXT.md (design system): Outfit for all UI/body text,
// JetBrains Mono for numbers, IDs, durations, and data-like values that
// scan down a column. Both loaded via next/font/google so the build
// fingerprints the font files and avoids the FOUT.
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Related",
  description: "Ambient relationship intelligence",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  );
}
