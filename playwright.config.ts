import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env["CARVRUM_BASE_URL"] ?? "http://127.0.0.1:3000",
    viewport: { width: 390, height: 844 },
    launchOptions: process.env["CARVRUM_BROWSER_PATH"]
      ? {
          executablePath: process.env["CARVRUM_BROWSER_PATH"],
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        }
      : {},
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env["CI"],
  },
});
