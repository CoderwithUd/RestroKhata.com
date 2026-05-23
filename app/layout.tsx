import type { Metadata, Viewport } from "next";
import { siteDescription, siteTitle } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://restrokhata.com"),
  title: siteTitle,
  description: siteDescription,
  icons: {
    icon: [
      {
        url: "/favicon.ico",
        sizes: "any"
      },
      {
        url: "/RestroKhata-RK-Complete-Icons/favicon-48x48.png",
        sizes: "48x48",
        type: "image/png"
      },
      {
        url: "/RestroKhata-RK-Complete-Icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        url: "/RestroKhata-RK-Complete-Icons/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png"
      },
      {
        url: "/RestroKhata-RK-Complete-Icons/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png"
      }
    ],
    shortcut: "/favicon.ico",
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png"
      },
      {
        url: "/RestroKhata-RK-Complete-Icons/apple-touch-icon-180x180.png",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  },
  manifest: "/RestroKhata-RK-Complete-Icons/manifest.json",
  keywords: [
    "restaurant management software India",
    "cafe management system",
    "QR code restaurant ordering system",
    "GST billing software for restaurant",
    "restaurant POS free trial India",
    "restaurant billing software",
    "restaurant POS software",
    "billing software for restaurant",
    "GST billing software",
    "cafe billing software",
    "hotel billing software",
    "thermal invoice software",
    "restaurant management software",
  ],
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://restrokhata.com",
    siteName: "RestroKhata",
    title: "RestroKhata - Run Your Cafe or Restaurant Like a Pro",
    description:
      "Restaurant POS with QR ordering, live kitchen display, GST billing, and staff management. Free 1-month trial. Made in India.",
    images: [
      {
        url: "/RestroKhata-RK-Complete-Icons/og-image-1200x630.png",
        width: 1200,
        height: 630,
        alt: "RestroKhata restaurant POS dashboard"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/RestroKhata-RK-Complete-Icons/og-image-1200x630.png"]
  },
  robots: {
    index: true,
    follow: true
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f47b20"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
