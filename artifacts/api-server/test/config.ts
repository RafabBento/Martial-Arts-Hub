// Shared config for the e2e test suite. The same port is used by the global
// setup (which spawns the built server) and the test helpers (which make HTTP
// requests against it).
export const TEST_PORT = Number(process.env.TEST_PORT ?? 8123);
export const BASE_URL = `http://localhost:${TEST_PORT}`;
