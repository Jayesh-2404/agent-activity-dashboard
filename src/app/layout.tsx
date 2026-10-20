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

const themeScript = `(function(){try{var key="agent-activity-theme";var stored=localStorage.getItem(key);var dark=window.matchMedia("(prefers-color-scheme: dark)").matches;var theme=stored==="light"||stored==="dark"?stored:(dark?"dark":"light");var root=document.documentElement;root.dataset.theme=theme;root.style.colorScheme=theme;}catch(error){}})();`;

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#11150f" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
