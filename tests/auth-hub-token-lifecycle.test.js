import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashToken, seedConfiguredTokens } from "../src/security/auth.js";
import { MemoryStore } from "../src/storage/memoryStore.js";
import { PostgresStore } from "../src/storage/postgresStore.js";

const SCOPES = ["tasks:read"];

describe("configured API token lifecycle", () => {
  it("rotates MemoryStore credentials and revokes removed managed names", async () => {
    const store = new MemoryStore();
    const manualHash = hashToken("test-manual-token-value");
    await store.upsertApiToken({
      name: "manual-token",
      tokenHash: manualHash,
      scopes: SCOPES
    });

    await seedConfiguredTokens(store, [configuredToken("codex", "test-codex-token-old")]);
    const oldHash = hashToken("test-codex-token-old");
    assert.equal((await store.findApiTokenByHash(oldHash)).revokedAt, null);

    await seedConfiguredTokens(store, [configuredToken("codex", "test-codex-token-new")]);
    const newHash = hashToken("test-codex-token-new");
    assert.equal(await store.findApiTokenByHash(oldHash), null);
    assert.equal((await store.findApiTokenByHash(newHash)).revokedAt, null);

    const removed = await seedConfiguredTokens(store, []);
    assert.equal(removed.revoked, 1);
    assert.ok((await store.findApiTokenByHash(newHash)).revokedAt);
    assert.equal((await store.findApiTokenByHash(manualHash)).revokedAt, null);
  });

  it("revokes a removed project token through the reserved managed prefix", async () => {
    const store = new MemoryStore();
    const token = "test-project-token-value-000000";
    await seedConfiguredTokens(store, [configuredToken("project.parentinggame", token)]);
    const tokenHash = hashToken(token);
    assert.equal((await store.findApiTokenByHash(tokenHash)).revokedAt, null);

    const removed = await seedConfiguredTokens(store, []);
    assert.equal(removed.revoked, 1);
    assert.ok((await store.findApiTokenByHash(tokenHash)).revokedAt);
  });

  it("preserves revocation and expiry when the same credential is seeded again", async () => {
    const store = new MemoryStore();
    const tokenHash = hashToken("test-revoked-token-value");
    await store.syncConfiguredApiTokens(snapshot([{ name: "codex", tokenHash, expiresAt: null }]));
    const stored = store.apiTokens.get(tokenHash);
    stored.revokedAt = "2026-07-13T00:00:00.000Z";
    stored.expiresAt = "2026-07-13T01:00:00.000Z";

    const result = await store.syncConfiguredApiTokens(snapshot([{
      name: "codex",
      tokenHash,
      scopes: ["tasks:read", "connectors:read"],
      expiresAt: null
    }]));
    const preserved = await store.findApiTokenByHash(tokenHash);

    assert.equal(result.preserved, 1);
    assert.equal(preserved.revokedAt, "2026-07-13T00:00:00.000Z");
    assert.equal(preserved.expiresAt, "2026-07-13T01:00:00.000Z");
    assert.deepEqual(preserved.scopes, ["tasks:read", "connectors:read"]);
  });

  it("does not reactivate a same-hash credential through the generic upsert path", async () => {
    const store = new MemoryStore();
    const tokenHash = hashToken("test-upsert-revoked-token-value");
    await store.upsertApiToken({ name: "manual", tokenHash, scopes: SCOPES });
    store.apiTokens.get(tokenHash).revokedAt = "2026-07-13T00:00:00.000Z";
    store.apiTokens.get(tokenHash).expiresAt = "2026-07-13T01:00:00.000Z";

    const updated = await store.upsertApiToken({
      name: "manual",
      tokenHash,
      scopes: ["tasks:read", "audit:read"],
      expiresAt: null
    });

    assert.equal(updated.revokedAt, "2026-07-13T00:00:00.000Z");
    assert.equal(updated.expiresAt, "2026-07-13T01:00:00.000Z");
    assert.deepEqual(updated.scopes, ["tasks:read", "audit:read"]);
  });

  it("rejects a generic MemoryStore upsert when the hash belongs to another name", async () => {
    const store = new MemoryStore();
    const tokenHash = hashToken("test-upsert-conflict-token-value");
    await store.upsertApiToken({ name: "first", tokenHash, scopes: SCOPES });
    const before = JSON.stringify([...store.apiTokens.entries()]);

    await assert.rejects(
      store.upsertApiToken({ name: "second", tokenHash, scopes: SCOPES }),
      /another name/
    );
    assert.equal(JSON.stringify([...store.apiTokens.entries()]), before);
  });

  it("rejects duplicate configured credentials without changing MemoryStore", async () => {
    const store = new MemoryStore();
    const originalHash = hashToken("test-original-token-value");
    await store.syncConfiguredApiTokens(snapshot([{ name: "codex", tokenHash: originalHash }]));
    const before = JSON.stringify([...store.apiTokens.entries()]);
    const duplicateHash = hashToken("test-duplicate-token-value");

    await assert.rejects(
      store.syncConfiguredApiTokens(snapshot([
        { name: "admin", tokenHash: duplicateHash },
        { name: "codex", tokenHash: duplicateHash }
      ])),
      /must be unique/
    );
    assert.equal(JSON.stringify([...store.apiTokens.entries()]), before);
  });

  it("uses one Postgres transaction and keeps same-hash revocation fields untouched", async () => {
    const tokenHash = hashToken("test-postgres-token-value");
    const queries = [];
    const client = fakeClient(queries, [{
      id: "00000000-0000-4000-8000-000000000001",
      name: "codex",
      token_hash: tokenHash,
      scopes: SCOPES,
      executor_id: null,
      expires_at: "2026-07-13T01:00:00.000Z",
      revoked_at: "2026-07-13T00:00:00.000Z"
    }]);
    const store = Object.create(PostgresStore.prototype);
    store.pool = { connect: async () => client };

    const result = await store.syncConfiguredApiTokens(snapshot([{
      name: "codex",
      tokenHash,
      scopes: ["tasks:read", "connectors:read"]
    }]));

    assert.equal(result.preserved, 1);
    assert.equal(queries[0].text, "BEGIN");
    assert.match(queries[1].text, /pg_advisory_xact_lock/);
    assert.match(queries[3].text, /SET scopes = \$1, executor_id = \$2/);
    assert.equal(queries[3].text.includes("revoked_at"), false);
    assert.equal(queries[3].text.includes("expires_at"), false);
    assert.equal(queries.at(-1).text, "COMMIT");
    assert.equal(client.released, true);
  });

  it("preserves Postgres revocation fields in the generic same-hash upsert", async () => {
    const tokenHash = hashToken("test-postgres-upsert-token-value");
    const queries = [];
    const store = Object.create(PostgresStore.prototype);
    store.pool = {
      async query(text, params) {
        queries.push({ text, params });
        return { rows: [{
          id: "00000000-0000-4000-8000-000000000003",
          name: "manual",
          token_hash: tokenHash,
          scopes: SCOPES,
          executor_id: null,
          expires_at: "2026-07-13T01:00:00.000Z",
          revoked_at: "2026-07-13T00:00:00.000Z"
        }] };
      }
    };

    const result = await store.upsertApiToken({ name: "manual", tokenHash, scopes: SCOPES });

    assert.match(queries[0].text, /api_tokens\.token_hash = EXCLUDED\.token_hash/);
    assert.match(queries[0].text, /THEN api_tokens\.revoked_at/);
    assert.equal(result.revokedAt, "2026-07-13T00:00:00.000Z");
  });

  it("rolls the Postgres snapshot back when a hash belongs to another name", async () => {
    const tokenHash = hashToken("test-conflicting-token-value");
    const queries = [];
    const client = fakeClient(queries, [{
      id: "00000000-0000-4000-8000-000000000002",
      name: "manual-token",
      token_hash: tokenHash,
      scopes: SCOPES,
      executor_id: null,
      expires_at: null,
      revoked_at: null
    }]);
    const store = Object.create(PostgresStore.prototype);
    store.pool = { connect: async () => client };

    await assert.rejects(
      store.syncConfiguredApiTokens(snapshot([{ name: "codex", tokenHash }])),
      /another name/
    );
    assert.equal(queries.some((query) => query.text === "COMMIT"), false);
    assert.equal(queries.at(-1).text, "ROLLBACK");
    assert.equal(client.released, true);
  });
});

function configuredToken(name, token) {
  return { name, token, scopes: SCOPES, executorId: "", expiresAt: null };
}

function snapshot(activeTokens) {
  return {
    managedNames: ["admin", "executor", "codex"],
    activeTokens: activeTokens.map((record) => ({
      scopes: SCOPES,
      executorId: "",
      expiresAt: null,
      ...record
    }))
  };
}

function fakeClient(queries, existingRows) {
  return {
    released: false,
    async query(text, params = []) {
      queries.push({ text, params });
      if (text.includes("SELECT * FROM api_tokens")) return { rows: existingRows };
      if (text.includes("RETURNING name")) return { rows: [] };
      return { rows: [] };
    },
    release() {
      this.released = true;
    }
  };
}
