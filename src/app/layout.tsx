import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Private Payments Wallet",
  description: "Encrypted privacy wallet on Stellar testnet",
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
