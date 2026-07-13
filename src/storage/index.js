import { MemoryStore } from "./memoryStore.js";
import { PostgresStore } from "./postgresStore.js";

export function createStore(config) {
  if (config.databaseUrl) {
    return new PostgresStore({ connectionString: config.databaseUrl, retention: config.retention });
  }
  return new MemoryStore({ retention: config.retention });
}
