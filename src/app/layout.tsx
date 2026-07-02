import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veil — Private Payments Wallet",
  description: "Privacy-preserving USDC payments on Stellar. Shield, transfer, and manage USDC with ZK-proof privacy.",
  icons: {
    icon: "/Veil_Bg_Removed_Logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-950 antialiased">
        {children}
      </body>
    </html>
  );
}
