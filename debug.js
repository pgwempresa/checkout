import { getKvConfig, getRuntimeState, getStoreConnectionStatus } from "./lib/runtime/state.js";

async function run() {
  console.log("Storage Mode:", process.env.STORAGE_REST_API_URL ? "redis" : "memory");
}
run();
