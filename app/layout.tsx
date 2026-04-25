import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { getOutletConfig } from "@/lib/api-server/runtime-config";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * Metadata di-generate dinamis dari outlet config — biar tab title browser
 * ikut brand outlet. Franchise-ready (tidak ada hardcoded "ALLEE").
 *
 * Kalau outlet belum sync, getOutletConfig() return placeholder ("POS"),
 * dan tab title pakai itu — tetap aman.
 */
export async function generateMetadata(): Promise<Metadata> {
  const outlet = await getOutletConfig().catch(() => null);
  const brand = outlet?.brandName || "POS";
  const subtitle = outlet?.subtitle || "Point of Sale";
  return {
    title: `${brand} POS`,
    description: `${brand} — ${subtitle}`,
    applicationName: `${brand} POS`,
    appleWebApp: {
      capable: true,
      title: `${brand} POS`,
      statusBarStyle: "black-translucent",
    },
    formatDetection: {
      telephone: false,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#a85725" },
    { media: "(prefers-color-scheme: dark)", color: "#7a3e1a" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={inter.variable}>
      <body className="min-h-[100dvh] bg-background font-sans antialiased">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
