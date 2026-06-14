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
          allowOutbound: policy.allowOutbound ?? "always",
          providerType: provider.type
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
