import { getPlatformAuthOperation } from "../connectors/platformAuthContracts.js";

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const TOKEN_ENV_PATTERN = /^[A-Z][A-Z0-9_]{2,127}$/;
const SAFE_PROJECT_OPERATIONS = new Set([
  "xiaohongshu/check_session",
  "xiaohongshu/search_content",
  "wechat_official/check_health",
  "github/check_auth"
]);
const GITHUB_SCOPES = new Set(["repo_read", "actions_read", "pull_request_read"]);

export const PROJECT_TOKEN_PREFIX = "project.";

export function parseProjectClientEntries(env = process.env) {
  const raw = String(env.AI_LINK_PROJECT_CLIENTS_JSON || "").trim();
  if (!raw) return [];

  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("AI_LINK_PROJECT_CLIENTS_JSON must be valid JSON.");
  }
  if (!Array.isArray(value) || value.length > 50) {
    throw new Error("AI_LINK_PROJECT_CLIENTS_JSON must contain an array with at most 50 entries.");
  }

  const entries = value.map((item) => normalizeProjectClientEntry(item, env));
  assertUnique(entries.map((item) => item.id), "Project client ids must be unique.");
  assertUnique(entries.map((item) => item.tokenEnv), "Project client token env names must be unique.");
  assertUnique(entries.map((item) => item.token), "Project client token values must be unique.");
  return entries;
}

export function publicProjectClientPolicy(entry) {
  return {
    id: entry.id,
    actorName: entry.actorName,
    operations: [...entry.operations],
    githubTargets: entry.githubTargets.map((target) => ({
      repository: target.repository,
      scopes: [...target.scopes]
    }))
  };
}

export function projectClientPolicyForActor(config, actorName) {
  return config.projectClients?.find((item) => item.actorName === actorName) || null;
}

export function validateProjectTaskPolicy(policy, parsed) {
  if (!policy || parsed.workflow !== "platform_auth_collect") {
    return { error: "project_task_not_allowed" };
  }
  const operationKey = `${parsed.input?.platform || ""}/${parsed.input?.operation || ""}`;
  if (!policy.operations.includes(operationKey)) {
    return { error: "project_operation_not_allowed" };
  }
  if (operationKey === "github/check_auth") {
    const repository = `${parsed.input.owner}/${parsed.input.repo}`.toLowerCase();
    const scope = String(parsed.input.scope || "");
    const targetAllowed = policy.githubTargets.some((target) =>
      target.repository === repository && target.scopes.includes(scope)
    );
    if (!targetAllowed) return { error: "project_target_not_allowed" };
  }
  const requestId = String(parsed.options?.requestId || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(requestId)) {
    return { error: "project_request_id_required" };
  }
  parsed.options.requestId = requestId;
  return { ok: true };
}

function normalizeProjectClientEntry(value, env) {
  if (!isPlainObject(value)) {
    throw new Error("Each project client entry must be an object.");
  }
  const allowedFields = new Set(["id", "tokenEnv", "operations", "githubTargets"]);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) {
    throw new Error("Project client entries contain unsupported fields.");
  }

  const id = String(value.id || "").trim().toLowerCase();
  if (!PROJECT_ID_PATTERN.test(id)) {
    throw new Error("Project client id has an invalid format.");
  }
  const tokenEnv = String(value.tokenEnv || "").trim();
  if (!TOKEN_ENV_PATTERN.test(tokenEnv)) {
    throw new Error("Project client tokenEnv has an invalid format.");
  }
  const token = String(env[tokenEnv] || "");
  if (token.length < 24 || token.length > 4096) {
    throw new Error(`Project client token env ${tokenEnv} must contain a 24-4096 character token.`);
  }

  if (!Array.isArray(value.operations) || value.operations.length === 0) {
    throw new Error("Project client operations must be a non-empty array.");
  }
  const operations = [...new Set(value.operations.map((item) => String(item || "").trim()))];
  if (operations.length > SAFE_PROJECT_OPERATIONS.size) {
    throw new Error("Project client operations exceed the supported read-only set.");
  }
  for (const operationKey of operations) {
    const [platform, operation, extra] = operationKey.split("/");
    if (extra || !SAFE_PROJECT_OPERATIONS.has(operationKey) || !getPlatformAuthOperation(platform, operation)) {
      throw new Error("Project client operations contain an unsupported operation.");
    }
  }
  const githubTargets = normalizeGithubTargets(value.githubTargets);
  if (operations.includes("github/check_auth") !== (githubTargets.length > 0)) {
    throw new Error("Project clients using github/check_auth must define non-empty githubTargets, and other clients must omit them.");
  }

  return {
    id,
    actorName: `${PROJECT_TOKEN_PREFIX}${id}`,
    tokenEnv,
    token,
    operations,
    githubTargets
  };
}

function normalizeGithubTargets(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new Error("Project client githubTargets must contain 1-20 entries.");
  }
  const targets = value.map((item) => {
    if (!isPlainObject(item) || Object.keys(item).some((key) => !["repository", "scopes"].includes(key))) {
      throw new Error("Project client githubTargets contain an invalid entry.");
    }
    const repository = String(item.repository || "").trim().toLowerCase();
    if (!/^[a-z0-9_.-]{1,100}\/[a-z0-9_.-]{1,100}$/.test(repository)) {
      throw new Error("Project client githubTargets contain an invalid repository.");
    }
    if (!Array.isArray(item.scopes) || item.scopes.length === 0) {
      throw new Error("Project client githubTargets must define at least one scope.");
    }
    const scopes = [...new Set(item.scopes.map((scope) => String(scope || "").trim()))];
    if (scopes.some((scope) => !GITHUB_SCOPES.has(scope))) {
      throw new Error("Project client githubTargets contain an unsupported scope.");
    }
    return { repository, scopes };
  });
  assertUnique(targets.map((target) => target.repository), "Project client githubTargets repositories must be unique.");
  return targets;
}

function assertUnique(values, message) {
  if (new Set(values).size !== values.length) throw new Error(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
