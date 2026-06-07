import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(baseConfig, defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/tests/**",
      "**/dist/**",
      "**/src/lib/store/__tests__/auth-stress.test.ts",
      "**/src/lib/store/__tests__/importerStress.test.ts",
      "**/src/lib/store/__tests__/live-crud.test.ts",
      "**/src/lib/store/__tests__/rls-verification.test.ts",
      "**/src/lib/store/__tests__/security-stress.test.ts",
      "**/src/lib/store/__tests__/staff-audit-live.test.ts",
      "**/src/lib/store/__tests__/stress.test.ts",
    ],
  },
}));
