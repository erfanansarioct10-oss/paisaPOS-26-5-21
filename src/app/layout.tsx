import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { connection } from "next/server";
import { ThemeProvider } from "@/shared/layout/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://paisa-pos-26-5-21.vercel.app"),
  title: "Chlorif - Real-Time Billing & Inventory Sync",
  description: "High-speed, inventory-first POS billing terminal for fashion boutiques and clothing stores in Nepal.",
  applicationName: "Chlorif",
  openGraph: {
    title: "Chlorif",
    description: "High-speed, inventory-first POS billing terminal for fashion boutiques and clothing stores in Nepal.",
    url: "/",
    siteName: "Chlorif",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Chlorif",
    description: "High-speed, inventory-first POS billing terminal for fashion boutiques and clothing stores in Nepal.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans selection:bg-primary/20 selection:text-primary">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
