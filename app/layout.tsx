import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const ICONS_BASE_PATH = "/RestroKhata-RK-Complete-Icons";
const PUBLIC_APP_URL = "https://restro-khata-com.vercel.app";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#FF6B00",
};

export const metadata: Metadata = {
title: {
  default: "Restro Khata - Smart Restaurant Management",
  template: "%s | Restro Khata",
},
description:
  "A smart SaaS platform for restaurants and cafes with real-time order tracking, QR-based menus, multi-user table ordering, and seamless invoice management.",
  applicationName: "Restro Khata",
  manifest: "/manifest.webmanifest",
  metadataBase: new URL(PUBLIC_APP_URL),
  icons: {
    icon: [
      {
        url: `${ICONS_BASE_PATH}/favicon.ico`,
        type: "image/x-icon",
      },
      {
        url: `${ICONS_BASE_PATH}/favicon-16x16.png`,
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: `${ICONS_BASE_PATH}/favicon-32x32.png`,
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: `${ICONS_BASE_PATH}/favicon-48x48.png`,
        sizes: "48x48",
        type: "image/png",
      },
      {
        url: `${ICONS_BASE_PATH}/favicon-64x64.png`,
        sizes: "64x64",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: `${ICONS_BASE_PATH}/apple-touch-icon-57x57.png`,
        sizes: "57x57",
        type: "image/png",
      },
      {
        url: `${ICONS_BASE_PATH}/apple-touch-icon-60x60.png`,
        sizes: "60x60",
        type: "image/png",
      },
      {
        url: `${ICONS_BASE_PATH}/apple-touch-icon-72x72.png`,
        sizes: "72x72",
        type: "image/png",
      },
      {
        url: `${ICONS_BASE_PATH}/apple-touch-icon-76x76.png`,
        sizes: "76x76",
        type: "image/png",
      },
      {
        url: `${ICONS_BASE_PATH}/apple-touch-icon-114x114.png`,
        sizes: "114x114",
        type: "image/png",
      },
      {
        url: `${ICONS_BASE_PATH}/apple-touch-icon-120x120.png`,
        sizes: "120x120",
        type: "image/png",
      },
      {
        url: `${ICONS_BASE_PATH}/apple-touch-icon-144x144.png`,
        sizes: "144x144",
        type: "image/png",
      },
      {
        url: `${ICONS_BASE_PATH}/apple-touch-icon-152x152.png`,
        sizes: "152x152",
        type: "image/png",
      },
      {
        url: `${ICONS_BASE_PATH}/apple-touch-icon-180x180.png`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcut: [`${ICONS_BASE_PATH}/favicon.ico`],
  },
  appleWebApp: {
    capable: true,
    title: "Restro Khata",
    statusBarStyle: "default",
  },
  openGraph: {
    images: [
      {
        url: `${ICONS_BASE_PATH}/og-image-1200x630.png`,
        width: 1200,
        height: 630,
        alt: "Restro Khata",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [`${ICONS_BASE_PATH}/og-image-1200x630.png`],
  },
  other: {
    "msapplication-config": `${ICONS_BASE_PATH}/browserconfig.xml`,
    "msapplication-TileColor": "#FF6B00",
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${fraunces.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
