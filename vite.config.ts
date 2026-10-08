import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => ({
  plugins: [
    tsconfigPaths(),
    tanstackStart(
      mode === "native"
        ? { spa: { enabled: true, prerender: { outputPath: "/index", autoSubfolderIndex: false } } }
        : {},
    ),
    nitro(
      mode === "native"
        ? {
            preset: "node-server",
            output: {
              dir: "dist-native",
              publicDir: "dist-native/public",
              serverDir: "dist-native/server",
            },
          }
        : { preset: "vercel" },
    ),
    viteReact(),
    tailwindcss(),
  ],
}));
