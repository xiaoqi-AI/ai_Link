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
    const approval = resolvePolicyApproval({
      task: request.task,
      policyName,
      policy,
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
          policy: policyName
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
  request: RunRequest;
}): RunResult["approval"] {
  const approval = input.policy.approval;
  if (!approval?.required) {
    return undefined;
  }

  const mode = approval.mode ?? "always";
  if (mode === "live" && input.request.dryRun) {
    return {
      required: true,
      approved: false,
      enforced: false,
      mode,
      reason: approval.reason
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
        reason: approval.reason
      }
    );
  }

  return {
    required: true,
    approved: true,
    enforced: true,
    mode,
    reason: approval.reason
  };
}
