import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.dsoncmata.carvrum",
  appName: "CARVRUM",
  webDir: "dist-native/public",
  server: { hostname: "localhost", androidScheme: "https" },
  android: { useLegacyBridge: true, allowMixedContent: false, webContentsDebuggingEnabled: false },
  ios: { contentInset: "automatic" },
};
export default config;
