import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const sans = Familjen_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-familjen",
});

const mono = Spline_Sans_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-spline",
});

export const metadata: Metadata = {
  title: "Agent Activity",
  description: "A phone-first review queue for agent work across GitHub repositories.",
  applicationName: "Agent Activity",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Agent Activity",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f2f4ef",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
