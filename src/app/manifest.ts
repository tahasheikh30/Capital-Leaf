import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Capital Leaf, personal finance",
    short_name: "Capital Leaf",
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
  };
}
