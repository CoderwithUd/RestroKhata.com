import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Restro Khata Auth",
  description: "Production-ready auth flow for Restro Khata.",
  applicationName: "Restro Khata",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/Logo/RestroKhataCircleLogo.png",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/Logo/RestroKhataCircleLogo.png",
        type: "image/png",
      },
    ],
    shortcut: ["/Logo/RestroKhataCircleLogo.png"],
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
