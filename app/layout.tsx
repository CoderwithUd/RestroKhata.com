import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "RestroKhata - Smart Restaurant & Cafe POS with QR Ordering";
const description =
  "RestroKhata is an all-in-one restaurant management system for Indian cafes, restaurants, and dhabas with QR ordering, KDS, GST billing, table management, staff roles, and revenue reports.";

export const metadata: Metadata = {
  metadataBase: new URL("https://restrokhata.com"),
  title,
  description,
  keywords: [
    "restaurant management software India",
    "cafe management system",
    "QR code restaurant ordering system",
    "GST billing software for restaurant",
    "restaurant POS free trial India"
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
      "All-in-one restaurant POS with QR ordering, live kitchen display, GST billing, and staff management. Free 3-month trial. Made in India."
  },
  twitter: {
    card: "summary_large_image",
    title,
    description
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
      <body>{children}</body>
    </html>
  );
}
