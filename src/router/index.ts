import { AiLinkError } from "../errors.js";
import { collectOutboundText, scanSensitiveText } from "../policies/sensitive.js";
import { getProviderAdapter } from "../providers/registry.js";
import type {
  AiLinkConfig,
  PolicyConfig,
  ProviderConfig,
  RouteConfig,
  RunAttempt,
  RunRequest,
  RunResult
} from "../types.js";

export async function runAiLink(config: AiLinkConfig, request: RunRequest): Promise<RunResult> {
  const route = resolveRoute(config, request.task);
  const { name: policyName, policy } = resolvePolicy(config, route);
  const outboundText = collectOutboundText(request);

  if (!request.allowSensitive) {
    const findings = scanSensitiveText(outboundText, policy);
    if (findings.length > 0) {
      throw new AiLinkError(
        `Outbound content blocked by policy: ${findings.map((finding) => finding.label).join(", ")}`,
        "POLICY_BLOCKED",
        findings
      );
    }
  }

  const candidates = resolveProviderCandidates(config, route, request);
  const attempts: RunAttempt[] = [];

  for (const providerName of candidates) {
    const provider = config.providers?.[providerName];
    if (!provider) {
      attempts.push({ provider: providerName, ok: false, error: "Provider is not configured." });
      continue;
    }

    const model = request.model ?? route.model ?? provider.model ?? "default";
    const providerPolicyError = validateProviderTypePolicy({
      task: request.task,
      policyName,
      policy,
      providerName,
      provider
    });
    if (providerPolicyError) {
      attempts.push({ provider: providerName, model, ok: false, error: providerPolicyError.message });
      if (request.provider) {
        throw providerPolicyError;
      }
      continue;
    }

    const preflightError = validatePolicyPreflight({
      task: request.task,
      policyName,
      policy,
      providerName,
      provider,
      model,
      outboundText
    });
    if (preflightError) {
      attempts.push({ provider: providerName, model, ok: false, error: preflightError.message });
      if (request.provider) {
        throw preflightError;
      }
      continue;
    }

    const usageEstimate = estimateUsage({
      provider,
      outboundText
    });

    const approval = resolvePolicyApproval({
      task: request.task,
      policyName,
      policy,
      provider,
      request
    });
    try {
      const adapter = getProviderAdapter(provider);
      const result = await adapter.run({
        providerName,
        provider: provider as ProviderConfig,
        request,
        model,
        dryRun: request.dryRun ?? false
      });
      attempts.push({ provider: providerName, model, ok: true });
      return {
        task: request.task,
        provider: providerName,
        model,
        output: result.output,
        dryRun: request.dryRun ?? false,
        approval,
        attempts,
        metadata: {
          ...result.metadata,
          policy: policyName,
          policyDataClass: policy.dataClass,
          policyAuditTags: policy.auditTags ?? [],
          policyBudget: policy.budget,
          allowOutbound: policy.allowOutbound ?? "always",
          providerType: provider.type,
          usageEstimate
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({ provider: providerName, model, ok: false, error: message });
      if (request.provider) {
        break;
      }
    }
  }

  throw new AiLinkError(
    `No provider completed task "${request.task}".`,
    "ROUTE_FAILED",
    attempts
  );
}

export function resolveRoute(config: AiLinkConfig, task: string): RouteConfig {
  return config.routes?.[task] ?? {
    provider: config.defaults?.provider ?? "mock"
  };
}

export function resolveProviderCandidates(
  config: AiLinkConfig,
  route: RouteConfig,
  request: RunRequest
): string[] {
  if (request.provider) {
    return [request.provider];
  }

  const primary = route.provider ?? config.defaults?.provider ?? "mock";
  return [...new Set([primary, ...(route.fallback ?? [])])];
}

function resolvePolicy(config: AiLinkConfig, route: RouteConfig): { name: string; policy: PolicyConfig } {
  const policyName = route.policy ?? config.defaults?.policy ?? "default";
  return {
    name: policyName,
    policy: config.policies?.[policyName] ?? {}
  };
}

function resolvePolicyApproval(input: {
  task: string;
  policyName: string;
  policy: PolicyConfig;
  provider: ProviderConfig;
  request: RunRequest;
}): RunResult["approval"] {
  const allowOutbound = input.policy.allowOutbound ?? "always";
  const outbound = isOutboundProvider(input.provider);

  if (outbound && allowOutbound === "never" && !input.request.dryRun) {
    throw new AiLinkError(
      `Task "${input.task}" is blocked by outbound policy "${input.policyName}".`,
      "POLICY_OUTBOUND_BLOCKED",
      {
        task: input.task,
        policy: input.policyName,
        allowOutbound,
        providerType: input.provider.type
      }
    );
  }

  const approval = input.policy.approval;
  if (!approval?.required && !(outbound && allowOutbound === "user-approved")) {
    return undefined;
  }

  const mode = approval?.mode ?? "live";
  const reason = approval?.reason ?? "Outbound provider calls require user approval.";
  if (mode === "live" && input.request.dryRun) {
    return {
      required: true,
      approved: false,
      enforced: false,
      mode,
      reason
    };
  }

  if (!input.request.approvePolicy) {
    throw new AiLinkError(
      `Task "${input.task}" requires policy approval. Add --approve-policy or --approve.`,
      "POLICY_APPROVAL_REQUIRED",
      {
        task: input.task,
        policy: input.policyName,
        mode,
        allowOutbound,
        providerType: input.provider.type,
        reason
      }
    );
  }

  return {
    required: true,
    approved: true,
    enforced: true,
    mode,
    reason
  };
}

function isOutboundProvider(provider: ProviderConfig): boolean {
  return provider.type !== "mock";
}

function validatePolicyPreflight(input: {
  task: string;
  policyName: string;
  policy: PolicyConfig;
  providerName: string;
  provider: ProviderConfig;
  model: string;
  outboundText: string;
}): AiLinkError | undefined {
  const modelError = validateModelPolicy(input);
  if (modelError) {
    return modelError;
  }

  return validateBudgetPolicy(input);
}

function validateModelPolicy(input: {
  task: string;
  policyName: string;
  policy: PolicyConfig;
  providerName: string;
  provider: ProviderConfig;
  model: string;
}): AiLinkError | undefined {
  const allowed = input.policy.allowedModels ?? [];
  if (allowed.length > 0 && !matchesAnyModelPattern(input.model, allowed)) {
    return new AiLinkError(
      `Model "${input.model}" is blocked by policy "${input.policyName}" for task "${input.task}".`,
      "POLICY_MODEL_BLOCKED",
      {
        task: input.task,
        policy: input.policyName,
        provider: input.providerName,
        providerType: input.provider.type,
        model: input.model,
        allowedModels: allowed
      }
    );
  }

  const blocked = input.policy.blockedModels ?? [];
  if (matchesAnyModelPattern(input.model, blocked)) {
    return new AiLinkError(
      `Model "${input.model}" is blocked by policy "${input.policyName}" for task "${input.task}".`,
      "POLICY_MODEL_BLOCKED",
      {
        task: input.task,
        policy: input.policyName,
        provider: input.providerName,
        providerType: input.provider.type,
        model: input.model,
        blockedModels: blocked
      }
    );
  }

  return undefined;
}

function validateBudgetPolicy(input: {
  task: string;
  policyName: string;
  policy: PolicyConfig;
  providerName: string;
  provider: ProviderConfig;
  model: string;
  outboundText: string;
}): AiLinkError | undefined {
  const budget = input.policy.budget;
  if (!budget) {
    return undefined;
  }

  const usage = estimateUsage({
    provider: input.provider,
    outboundText: input.outboundText
  });

  if (budget.maxInputChars !== undefined && usage.inputChars > budget.maxInputChars) {
    return newBudgetError(input, "maxInputChars", usage, budget.maxInputChars);
  }

  if (budget.maxInputTokens !== undefined && usage.inputTokens > budget.maxInputTokens) {
    return newBudgetError(input, "maxInputTokens", usage, budget.maxInputTokens);
  }

  if (
    budget.maxOutputTokens !== undefined
    && usage.outputTokens !== undefined
    && usage.outputTokens > budget.maxOutputTokens
  ) {
    return newBudgetError(input, "maxOutputTokens", usage, budget.maxOutputTokens);
  }

  if (budget.maxEstimatedCostUsd !== undefined) {
    if (usage.estimatedCostUsd === undefined) {
      return new AiLinkError(
        `Task "${input.task}" cannot estimate model cost under policy "${input.policyName}".`,
        "POLICY_BUDGET_UNESTIMATED",
        {
          task: input.task,
          policy: input.policyName,
          provider: input.providerName,
          providerType: input.provider.type,
          model: input.model,
          required: "provider.pricing plus an output token limit in provider.requestDefaults"
        }
      );
    }

    if (usage.estimatedCostUsd > budget.maxEstimatedCostUsd) {
      return newBudgetError(input, "maxEstimatedCostUsd", usage, budget.maxEstimatedCostUsd);
    }
  }

  return undefined;
}

function newBudgetError(
  input: {
    task: string;
    policyName: string;
    providerName: string;
    provider: ProviderConfig;
    model: string;
  },
  limitName: string,
  usage: ReturnType<typeof estimateUsage>,
  limit: number
): AiLinkError {
  return new AiLinkError(
    `Task "${input.task}" exceeds policy budget "${input.policyName}" (${limitName}).`,
    "POLICY_BUDGET_EXCEEDED",
    {
      task: input.task,
      policy: input.policyName,
      provider: input.providerName,
      providerType: input.provider.type,
      model: input.model,
      limitName,
      limit,
      usage
    }
  );
}

function estimateUsage(input: {
  provider: ProviderConfig;
  outboundText: string;
}): {
  inputChars: number;
  inputTokens: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
} {
  const inputChars = input.outboundText.length;
  const inputTokens = estimateTokens(input.outboundText);
  const outputTokens = resolveOutputTokenLimit(input.provider);
  const estimatedCostUsd = estimateCostUsd({
    provider: input.provider,
    inputTokens,
    outputTokens
  });

  return {
    inputChars,
    inputTokens,
    outputTokens,
    estimatedCostUsd
  };
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateCostUsd(input: {
  provider: ProviderConfig;
  inputTokens: number;
  outputTokens?: number;
}): number | undefined {
  if (input.provider.type === "mock") {
    return 0;
  }

  const pricing = input.provider.pricing;
  if (!pricing || pricing.inputUsdPer1M === undefined) {
    return undefined;
  }

  const inputCost = input.inputTokens * pricing.inputUsdPer1M / 1_000_000;
  const outputCost = input.outputTokens !== undefined && pricing.outputUsdPer1M !== undefined
    ? input.outputTokens * pricing.outputUsdPer1M / 1_000_000
    : 0;

  if (input.outputTokens === undefined && pricing.outputUsdPer1M !== undefined) {
    return undefined;
  }

  return roundCost(inputCost + outputCost);
}

function roundCost(value: number): number {
  return Number(value.toFixed(8));
}

function resolveOutputTokenLimit(provider: ProviderConfig): number | undefined {
  const defaults = provider.requestDefaults ?? {};
  for (const key of ["max_tokens", "max_completion_tokens", "max_output_tokens", "maxOutputTokens"]) {
    const value = defaults[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.ceil(value);
    }
  }
  return undefined;
}

function matchesAnyModelPattern(model: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesModelPattern(model, pattern));
}

function matchesModelPattern(model: string, pattern: string): boolean {
  if (pattern === "*") {
    return true;
  }
  if (!pattern.includes("*")) {
    return model === pattern;
  }

  const escaped = pattern
    .split("*")
    .map(escapeRegExp)
    .join(".*");
  return new RegExp(`^${escaped}$`).test(model);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateProviderTypePolicy(input: {
  task: string;
  policyName: string;
  policy: PolicyConfig;
  providerName: string;
  provider: ProviderConfig;
}): AiLinkError | undefined {
  const allowed = input.policy.allowedProviderTypes ?? [];
  if (allowed.length > 0 && !allowed.includes(input.provider.type)) {
    return new AiLinkError(
      `Provider "${input.providerName}" is blocked by policy "${input.policyName}" for task "${input.task}".`,
      "POLICY_PROVIDER_TYPE_BLOCKED",
      {
        task: input.task,
        policy: input.policyName,
        provider: input.providerName,
        providerType: input.provider.type,
        allowedProviderTypes: allowed
      }
    );
  }

  const blocked = input.policy.blockedProviderTypes ?? [];
  if (blocked.includes(input.provider.type)) {
    return new AiLinkError(
      `Provider "${input.providerName}" is blocked by policy "${input.policyName}" for task "${input.task}".`,
      "POLICY_PROVIDER_TYPE_BLOCKED",
      {
        task: input.task,
        policy: input.policyName,
        provider: input.providerName,
        providerType: input.provider.type,
        blockedProviderTypes: blocked
      }
    );
  }

  return undefined;
}
