import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app.etc2.com"),
  title: {
    default: "etC2 - POD Analytics for Etsy Sellers",
    template: "%s | etC2",
  },
  description:
    "The all-in-one dashboard for Etsy print-on-demand sellers. Track orders, calculate true profit, and grow your business with real numbers.",
  openGraph: {
    title: "etC2 - POD Analytics for Etsy Sellers",
    description:
      "The all-in-one dashboard for Etsy print-on-demand sellers. Track orders, calculate true profit, and grow your business with real numbers.",
    siteName: "etC2",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "etC2 - POD Analytics for Etsy Sellers",
    description:
      "The all-in-one dashboard for Etsy print-on-demand sellers. Track orders, calculate true profit, and grow your business with real numbers.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
