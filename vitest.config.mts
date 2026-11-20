import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/unit/**/*.test.{ts,tsx}"],
    css: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:4010",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-anon-key",
      NEXT_PUBLIC_API_URL: "http://localhost:4010",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/lib/types.ts", "src/app/**/layout.tsx", "src/app/manifest.ts", "src/**/*.d.ts"],
      reporter: ["text-summary", "text", "lcov"],
    },
  },
});
