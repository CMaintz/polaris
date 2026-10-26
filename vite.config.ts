import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiPort = Number(process.env.POLARIS_PORT ?? 4480);

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 4481,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
  test: {
    root: ".",
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts", "src/shared/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/server/main.ts"],
      thresholds: { lines: 75, branches: 70, functions: 75, statements: 75 },
    },
  },
});
