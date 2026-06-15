import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_PORT, BASE_URL } from "./config";

const here = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(here, "..");

let child: ChildProcess | undefined;

async function waitForHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/healthz`);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `API server did not become healthy within ${timeoutMs}ms: ${String(lastErr)}`,
  );
}

/**
 * Vitest global setup: build output is produced by the `test` npm script before
 * vitest runs, so here we just spawn the real built server (dist/index.mjs) on a
 * dedicated test port and wait until it answers the health check. The returned
 * function tears the server down after the suite finishes.
 */
export default async function setup(): Promise<() => Promise<void>> {
  child = spawn("node", ["--enable-source-maps", "dist/index.mjs"], {
    cwd: artifactDir,
    env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: "test" },
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      // Surface unexpected crashes in the test output.
      console.error(`API server exited early (code=${code}, signal=${signal})`);
    }
  });

  await waitForHealth(45_000);

  return async () => {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
    }
  };
}
