import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Capital Leaf, personal finance",
    short_name: "Capital Leaf",
    description: "Track income, spending, budgets and stocks in one calm place.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f4f7f2",
    theme_color: "#5f7f63",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
