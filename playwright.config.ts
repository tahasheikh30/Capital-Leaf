import { defineConfig, devices } from "@playwright/test";

const APP = "http://localhost:3010";
const API = "http://localhost:4010";
const env = { NEXT_PUBLIC_SUPABASE_URL: API, NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-anon-key", NEXT_PUBLIC_API_URL: API, MOCK_PORT: "4010", APP_ORIGIN: APP };
// In CI the Playwright browser is installed for us. Locally, point CHROME_PATH at an installed Chrome if needed.
const executablePath = process.env.CHROME_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false, // the mock backend keeps shared state, so tests run one at a time
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: APP, trace: "retain-on-failure", screenshot: "only-on-failure", launchOptions: { executablePath, args: ["--no-sandbox"] } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath, args: ["--no-sandbox"] } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, launchOptions: { executablePath, args: ["--no-sandbox"] } } },
  ],
  webServer: [
    { command: "node e2e/mock-api.mjs", url: `${API}/health`, env, reuseExistingServer: !process.env.CI, timeout: 20_000 },
    { command: "npm run build && npx next start -p 3010", url: `${APP}/login`, env, reuseExistingServer: !process.env.CI, timeout: 300_000 },
  ],
});
