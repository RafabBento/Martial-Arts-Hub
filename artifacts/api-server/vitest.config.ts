import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/globalSetup.ts"],
    include: ["test/**/*.e2e.test.ts"],
    // Face-model load + the first recognition pass after a cold start are slow.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // The suite shares one server + DB state, so run files/tests serially.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
