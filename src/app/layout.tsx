import type { Metadata, Viewport } from "next";
import { Roboto_Flex, Inter, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import { AttributionFooter } from "../components/AttributionFooter";

// Display face — Roboto Flex carries both weight and width axes; the width (`wdth`)
// axis is load-bearing for the EarshotDial's live re-typesetting (openers expand
// as headliners condense). Self-hosted via next/font/google, no runtime CDN.
const robotoFlex = Roboto_Flex({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["wdth"],
});

// Body / sentence voice — the quiet, neutral UI face.
const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

// Utility / box-office voice — dates, prices, serials, tickers.
const splineSansMono = Spline_Sans_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Absolute base so per-page canonical + OG/Twitter image URLs resolve to
  // fully-qualified links when crawlers unfurl a shared link.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://earshot-one.vercel.app"),
  title: "Earshot",
  description: "The gig listings you read from the bottom up.",
};

// LOAD-BEARING for the fixed RadioPlayer's iOS safe-area handling (metriq
// 5785e89a). `viewport-fit=cover` lets the page draw into the home-indicator /
// notch region AND is what activates the `env(safe-area-inset-*)` values —
// without it those insets resolve to 0, so the player's `paddingBottom:
// env(safe-area-inset-bottom)` and the html `scroll-padding-bottom` inset are
// silent no-ops. In Next 16 this is emitted via the `viewport` export, not a
// hand-written <meta> tag.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${robotoFlex.variable} ${inter.variable} ${splineSansMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        {/* Site-wide required source credit (Task 5.1) — mounted once here so
            landing, playlist, empty, error and 404 all carry the JamBase +
            Apple linkbacks. Rendered in NORMAL FLOW after the content: the
            earlier `flex flex-col` + `mt-auto` layout broke the RadioPlayer's
            `position: sticky` (it only appeared at the very end of the page), so
            the footer sits after the content instead and the sticky bar works. */}
        <AttributionFooter />
      </body>
    </html>
  );
}
