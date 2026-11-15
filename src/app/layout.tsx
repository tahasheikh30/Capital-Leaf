import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import RegisterSW from "@/components/RegisterSW";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Capital Leaf | Personal finance tracker",
  description: "Track income, spending, budgets and stocks in one calm place.",
  applicationName: "Capital Leaf",
  appleWebApp: { capable: true, title: "Capital Leaf", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#5f7f63",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render on every request so each page can carry that request's CSP nonce.
  await connection();
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
