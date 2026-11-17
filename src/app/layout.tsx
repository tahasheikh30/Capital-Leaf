import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { PreferencesProvider, type Density, type Theme } from "@/lib/preferences";
import RegisterSW from "@/components/RegisterSW";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";
import "./design.css";

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
  themeColor: "#203e32",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render on every request so each page can carry that request's CSP nonce.
  await connection();
  const jar = await cookies();
  const t = jar.get("cl-theme")?.value;
  const theme: Theme | null = t === "dark" || t === "light" ? t : null;
  const density: Density = jar.get("cl-density")?.value === "compact" ? "compact" : "comfortable";
  return (
    <html lang="en" data-theme={theme ?? "light"} data-density={density} suppressHydrationWarning>
      <body>
        <PreferencesProvider initialTheme={theme} initialDensity={density}>
          <ToastProvider>{children}</ToastProvider>
        </PreferencesProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
