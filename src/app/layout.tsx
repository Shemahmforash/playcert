import type { Metadata } from "next";
import { Roboto_Flex, Inter, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

// Display face — Roboto Flex carries both weight and width axes; the width (`wdth`)
// axis is load-bearing for the SmallFontDial's live re-typesetting (openers expand
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
  title: "Small Font",
  description: "The gig listings you read from the bottom up.",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
