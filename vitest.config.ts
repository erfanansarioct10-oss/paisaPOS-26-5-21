import { defineConfig } from "vitest/config";
import path from "path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/tests/**", "**/dist/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/server/test/server-only-test-stub.ts"),
    },
  },
});
