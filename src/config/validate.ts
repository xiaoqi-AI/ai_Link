import type {
  AiLinkConfig,
  PolicyConfig,
  ProviderConfig,
  ProviderType,
  RouteConfig,
  WorkflowConfig
} from "../types.js";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  path: string;
  message: string;
}

const PROVIDER_TYPES = new Set<ProviderType>([
  "mock",
  "openai-compatible",
  "deepseek",
  "kimi",
  "grok",
  "coze"
]);

const POLICY_ALLOW_OUTBOUND = new Set(["never", "user-approved", "always"]);
const WORKFLOW_APPROVAL_MODES = new Set(["always", "live"]);
const POLICY_DATA_CLASSES = new Set(["public", "internal", "restricted"]);

export function validateConfig(config: AiLinkConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const providers = config.providers ?? {};
  const routes = config.routes ?? {};
  const workflows = config.workflows ?? {};
  const policies = config.policies ?? {};

  if (config.version !== undefined && config.version !== 1) {
    issues.push({
      severity: "warning",
      path: "version",
      message: "Only config version 1 is currently documented."
    });
  }

  validateDefaultProvider(config, providers, issues);
  validateDefaultPolicy(config, policies, issues);

  for (const [name, provider] of Object.entries(providers)) {
    validateProvider(name, provider, issues);
  }

  for (const [name, route] of Object.entries(routes)) {
    validateRoute(name, route, providers, policies, issues);
  }

  for (const [name, workflow] of Object.entries(workflows)) {
    validateWorkflow(name, workflow, routes, providers, issues);
  }

  for (const [name, policy] of Object.entries(policies)) {
    validatePolicy(name, policy, issues);
  }

  return issues;
}

function validateWorkflow(
  name: string,
  workflow: WorkflowConfig,
  routes: Record<string, RouteConfig>,
  providers: Record<string, ProviderConfig>,
  issues: ValidationIssue[]
): void {
  for (const [index, stage] of (workflow.stages ?? []).entries()) {
    if (!stage.name) {
      issues.push({
        severity: "error",
        path: `workflows.${name}.stages.${index}.name`,
        message: "Workflow stages need a stable name."
      });
    }

    const task = stage.task ?? `${name}.${stage.name}`;
    if (!routes[task]) {
      issues.push({
        severity: "error",
        path: `workflows.${name}.stages.${index}.task`,
        message: `Workflow stage task "${task}" is not configured in routes.`
      });
    }

    if (stage.provider && !providers[stage.provider]) {
      issues.push({
        severity: "error",
        path: `workflows.${name}.stages.${index}.provider`,
        message: `Workflow stage provider "${stage.provider}" is not configured.`
      });
    }

    if (
      stage.inputFrom &&
      !["original", "previous", "original-and-previous"].includes(stage.inputFrom)
    ) {
      issues.push({
        severity: "error",
        path: `workflows.${name}.stages.${index}.inputFrom`,
        message: "inputFrom must be original, previous, or original-and-previous."
      });
    }

    if (stage.approval?.mode && !WORKFLOW_APPROVAL_MODES.has(stage.approval.mode)) {
      issues.push({
        severity: "error",
        path: `workflows.${name}.stages.${index}.approval.mode`,
        message: "approval.mode must be always or live."
      });
    }
  }
}

export function hasValidationErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

function validateDefaultProvider(
  config: AiLinkConfig,
  providers: Record<string, ProviderConfig>,
  issues: ValidationIssue[]
): void {
  const provider = config.defaults?.provider;
  if (provider && !providers[provider]) {
    issues.push({
      severity: "error",
      path: "defaults.provider",
      message: `Default provider "${provider}" is not configured.`
    });
  }
}

function validateDefaultPolicy(
  config: AiLinkConfig,
  policies: Record<string, PolicyConfig>,
  issues: ValidationIssue[]
): void {
  const policy = config.defaults?.policy;
  if (policy && !policies[policy]) {
    issues.push({
      severity: "error",
      path: "defaults.policy",
      message: `Default policy "${policy}" is not configured.`
    });
  }
}

function validateProvider(name: string, provider: ProviderConfig, issues: ValidationIssue[]): void {
  if (!PROVIDER_TYPES.has(provider.type)) {
    issues.push({
      severity: "error",
      path: `providers.${name}.type`,
      message: `Provider type "${provider.type}" is not supported.`
    });
  }

  if (provider.type !== "mock" && provider.type !== "coze" && !provider.baseUrl && !provider.endpoint) {
    issues.push({
      severity: "error",
      path: `providers.${name}.baseUrl`,
      message: "Model providers need baseUrl or endpoint."
    });
  }

  if (provider.apiKey && provider.apiKeyEnv) {
    issues.push({
      severity: "warning",
      path: `providers.${name}`,
      message: "Both apiKey and apiKeyEnv are set; apiKeyEnv is safer for shared configs."
    });
  }

  if (provider.apiKey) {
    issues.push({
      severity: "warning",
      path: `providers.${name}.apiKey`,
      message: "Inline apiKey should only appear in private local config, never in public project config."
    });
  }

  if (provider.command) {
    issues.push({
      severity: "warning",
      path: `providers.${name}.command`,
      message: "Provider command should only appear in private local or user config, never in public project config."
    });
  }

  if (provider.type !== "mock" && !provider.model) {
    issues.push({
      severity: "warning",
      path: `providers.${name}.model`,
      message: "Provider has no default model; commands must pass --model."
    });
  }
}

function validateRoute(
  name: string,
  route: RouteConfig,
  providers: Record<string, ProviderConfig>,
  policies: Record<string, PolicyConfig>,
  issues: ValidationIssue[]
): void {
  if (route.provider && !providers[route.provider]) {
    issues.push({
      severity: "error",
      path: `routes.${name}.provider`,
      message: `Route provider "${route.provider}" is not configured.`
    });
  }

  for (const provider of route.fallback ?? []) {
    if (!providers[provider]) {
      issues.push({
        severity: "error",
        path: `routes.${name}.fallback`,
        message: `Fallback provider "${provider}" is not configured.`
      });
    }
  }

  if (route.policy && !policies[route.policy]) {
    issues.push({
      severity: "error",
      path: `routes.${name}.policy`,
      message: `Route policy "${route.policy}" is not configured.`
    });
  }
}

function validatePolicy(name: string, policy: PolicyConfig, issues: ValidationIssue[]): void {
  if (policy.allowOutbound && !POLICY_ALLOW_OUTBOUND.has(policy.allowOutbound)) {
    issues.push({
      severity: "error",
      path: `policies.${name}.allowOutbound`,
      message: `allowOutbound must be one of: ${Array.from(POLICY_ALLOW_OUTBOUND).join(", ")}.`
    });
  }

  for (const [index, pattern] of (policy.blockPatterns ?? []).entries()) {
    try {
      new RegExp(pattern);
    } catch {
      issues.push({
        severity: "error",
        path: `policies.${name}.blockPatterns.${index}`,
        message: "Custom block pattern is not a valid regular expression."
      });
    }
  }

  validateProviderTypeList(name, "allowedProviderTypes", policy.allowedProviderTypes, issues);
  validateProviderTypeList(name, "blockedProviderTypes", policy.blockedProviderTypes, issues);

  const allowed = new Set(policy.allowedProviderTypes ?? []);
  for (const providerType of policy.blockedProviderTypes ?? []) {
    if (allowed.has(providerType)) {
      issues.push({
        severity: "error",
        path: `policies.${name}.blockedProviderTypes`,
        message: `Provider type "${providerType}" cannot be both allowed and blocked.`
      });
    }
  }

  if (policy.dataClass && !POLICY_DATA_CLASSES.has(policy.dataClass)) {
    issues.push({
      severity: "error",
      path: `policies.${name}.dataClass`,
      message: `dataClass must be one of: ${Array.from(POLICY_DATA_CLASSES).join(", ")}.`
    });
  }

  for (const [index, tag] of (policy.auditTags ?? []).entries()) {
    if (!tag || !/^[A-Za-z0-9._-]+$/.test(tag)) {
      issues.push({
        severity: "error",
        path: `policies.${name}.auditTags.${index}`,
        message: "auditTags must contain stable names using letters, numbers, dot, underscore, or dash."
      });
    }
  }

  if (policy.approval?.mode && !WORKFLOW_APPROVAL_MODES.has(policy.approval.mode)) {
    issues.push({
      severity: "error",
      path: `policies.${name}.approval.mode`,
      message: "approval.mode must be always or live."
    });
  }
}

function validateProviderTypeList(
  policyName: string,
  field: "allowedProviderTypes" | "blockedProviderTypes",
  values: ProviderType[] | undefined,
  issues: ValidationIssue[]
): void {
  for (const [index, providerType] of (values ?? []).entries()) {
    if (!PROVIDER_TYPES.has(providerType)) {
      issues.push({
        severity: "error",
        path: `policies.${policyName}.${field}.${index}`,
        message: `Provider type "${providerType}" is not supported.`
      });
    }
  }
}
