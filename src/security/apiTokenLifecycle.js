export const CONFIGURED_API_TOKEN_NAMES = Object.freeze(["admin", "executor", "codex"]);

const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/;
const TOKEN_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export function normalizeConfiguredApiTokenSnapshot({
  managedNames = CONFIGURED_API_TOKEN_NAMES,
  activeTokens = []
} = {}) {
  if (!Array.isArray(managedNames) || !Array.isArray(activeTokens)) {
    throw new Error("Configured API token snapshot must use arrays.");
  }

  const normalizedManagedNames = managedNames.map(normalizeName);
  if (new Set(normalizedManagedNames).size !== normalizedManagedNames.length) {
    throw new Error("Configured API token managed names must be unique.");
  }

  const managedSet = new Set(normalizedManagedNames);
  const normalizedTokens = activeTokens.map((record) => {
    const name = normalizeName(record?.name);
    if (!managedSet.has(name)) {
      throw new Error("Configured API token name is not managed by this snapshot.");
    }
    const tokenHash = String(record?.tokenHash || "").toLowerCase();
    if (!TOKEN_HASH_PATTERN.test(tokenHash)) {
      throw new Error("Configured API token hash has an invalid format.");
    }
    const scopes = Array.isArray(record?.scopes)
      ? [...new Set(record.scopes.map((scope) => String(scope || "").trim()).filter(Boolean))]
      : [];
    if (scopes.length === 0) {
      throw new Error("Configured API token must have at least one scope.");
    }
    return {
      name,
      tokenHash,
      scopes,
      executorId: String(record?.executorId || "").trim(),
      expiresAt: record?.expiresAt || null
    };
  });

  const names = normalizedTokens.map((record) => record.name);
  const hashes = normalizedTokens.map((record) => record.tokenHash);
  if (new Set(names).size !== names.length) {
    throw new Error("Configured API token names must be unique.");
  }
  if (new Set(hashes).size !== hashes.length) {
    throw new Error("Configured API token values must be unique.");
  }

  return {
    managedNames: normalizedManagedNames,
    activeTokens: normalizedTokens
  };
}

function normalizeName(value) {
  const name = String(value || "").trim();
  if (!TOKEN_NAME_PATTERN.test(name)) {
    throw new Error("Configured API token name has an invalid format.");
  }
  return name;
}
