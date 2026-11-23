import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CoinLeaf, personal finance",
    short_name: "CoinLeaf",
    description: "Track income, spending, budgets and stocks in one calm place.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#edf1e9",
    theme_color: "#203e32",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the app icon (Android, desktop) for these.
    shortcuts: [
      { name: "Add an expense", short_name: "Expense", url: "/dashboard?add=expense", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Add income", short_name: "Income", url: "/dashboard?add=income", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Left to spend", short_name: "Left to spend", url: "/glance", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    // Windows widgets board (Edge). Other platforms ignore this member.
    widgets: [
      {
        name: "Left to spend",
        tag: "left-to-spend",
        description: "What is left to spend this month.",
        ms_ac_template: "/widgets/left-to-spend.json",
        type: "application/json",
        screenshots: [{ src: "/widgets/left-to-spend-preview.png", sizes: "480x300", label: "Left to spend this month" }],
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
        auth: false,
        update: 3600,
      },
    ],
  } as MetadataRoute.Manifest;
}
