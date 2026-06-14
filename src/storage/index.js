import { MemoryStore } from "./memoryStore.js";
import { PostgresStore } from "./postgresStore.js";

export function createStore(config) {
  if (config.databaseUrl) {
    return new PostgresStore({ connectionString: config.databaseUrl });
  }
  return new MemoryStore();
}
