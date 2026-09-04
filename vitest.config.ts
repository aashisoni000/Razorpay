import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
