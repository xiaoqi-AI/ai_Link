import type { AiLinkConfig, RouteConfig, WorkflowStageConfig } from "../types.js";

const PROVIDERS: Array<{ name: string; aliases: string[]; routable: boolean }> = [
  { name: "grok", aliases: ["grok"], routable: true },
  { name: "kimi", aliases: ["kimi"], routable: true },
  { name: "deepseek", aliases: ["deepseek"], routable: true },
  { name: "doubao", aliases: ["doubao", "豆包"], routable: true },
  { name: "coze", aliases: ["coze", "扣子"], routable: true },
  { name: "codex", aliases: ["codex"], routable: false },
  { name: "openai-compatible", aliases: ["openai-compatible"], routable: true }
];

const STAGE_HINTS: Array<{ stage: string; patterns: RegExp[]; fallback?: string[] }> = [
  {
    stage: "research",
    patterns: [/调研|研究|搜索|资料|信息收集|research|survey/i],
    fallback: ["deepseek", "kimi", "mock"]
  },
  {
    stage: "article_draft",
    patterns: [/写作|文章|草稿|撰写|改写|writing|article|draft/i],
    fallback: ["deepseek", "mock"]
  },
  {
    stage: "agent_flow",
    patterns: [/扣子|coze|工作流|agent|workflow/i],
    fallback: ["mock"]
  },
  {
    stage: "image_followup",
    patterns: [/图片|图像|image|vision/i],
    fallback: ["mock"]
  },
  {
    stage: "code_reasoning",
    patterns: [/代码|实现|编程|code|coding/i],
    fallback: ["mock"]
  }
];

export interface DraftRouteOptions {
  description: string;
  skillName?: string;
}

export function draftRoutesFromNaturalLanguage(options: DraftRouteOptions): AiLinkConfig {
  const skillName = normalizeSkillName(options.skillName ?? "new_skill");
  const routes: Record<string, RouteConfig> = {};
  const drafts = inferRouteDrafts(options.description);

  for (const { provider, stage } of drafts) {
    const routeKey = `${skillName}.${stage.stage}`;
    routes[routeKey] = {
      provider: provider.name,
      policy: inferPolicy(stage.stage),
      fallback: stage.fallback,
      capabilities: inferCapabilities(stage.stage)
    };
  }

  return {
    version: 1,
    routes,
    policies: buildDraftPolicies(routes)
  };
}

export function draftSkillConfigFromNaturalLanguage(options: DraftRouteOptions): AiLinkConfig {
  const skillName = normalizeSkillName(options.skillName ?? "new_skill");
  const routeConfig = draftRoutesFromNaturalLanguage({ ...options, skillName });
  const stages: WorkflowStageConfig[] = Object.keys(routeConfig.routes ?? {}).map((task, index) => ({
    name: task.slice(skillName.length + 1),
    task,
    inputFrom: index === 0 ? "original" : "original-and-previous"
  }));

  if (stages.length === 0) {
    return routeConfig;
  }

  return {
    ...routeConfig,
    workflows: {
      [skillName]: {
        description: options.description,
        stages
      }
    }
  };
}

function inferRouteDrafts(description: string): Array<{
  provider: { name: string; aliases: string[]; routable: boolean };
  stage: { stage: string; fallback?: string[] };
}> {
  const seenStages = new Set<string>();
  const drafts: Array<{
    provider: { name: string; aliases: string[]; routable: boolean };
    stage: { stage: string; fallback?: string[] };
  }> = [];

  for (const clause of splitClauses(description)) {
    const provider = PROVIDERS.find((candidate) => candidate.routable && includesAnyAlias(clause, candidate.aliases));
    if (!provider) {
      continue;
    }

    const stage = inferStage(clause);
    if (seenStages.has(stage.stage)) {
      continue;
    }
    seenStages.add(stage.stage);
    drafts.push({ provider, stage });
  }

  return drafts;
}

function splitClauses(description: string): string[] {
  return description
    .split(/[，,。；;\n]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function includesAnyAlias(text: string, aliases: string[]): boolean {
  const lower = text.toLowerCase();
  return aliases.some((alias) => lower.includes(alias.toLowerCase()));
}

function inferStage(text: string): { stage: string; fallback?: string[] } {
  for (const hint of STAGE_HINTS) {
    if (hint.patterns.some((pattern) => pattern.test(text))) {
      return hint;
    }
  }
  return {
    stage: "general",
    fallback: ["mock"]
  };
}

function inferCapabilities(stage: string): string[] {
  switch (stage) {
    case "research":
      return ["web_research", "text"];
    case "article_draft":
      return ["long_context", "text"];
    case "agent_flow":
      return ["agent_workflow"];
    case "image_followup":
      return ["image_understanding", "text"];
    case "code_reasoning":
      return ["code_reasoning", "text"];
    default:
      return ["text"];
  }
}

function inferPolicy(stage: string): string | undefined {
  return stage === "agent_flow" ? "external_action" : undefined;
}

function buildDraftPolicies(routes: Record<string, RouteConfig>): AiLinkConfig["policies"] {
  if (!Object.values(routes).some((route) => route.policy === "external_action")) {
    return undefined;
  }

  return {
    external_action: {
      blockSensitive: true,
      allowOutbound: "user-approved",
      allowedProviderTypes: ["coze", "mock"],
      allowedModels: ["coze-agent-*", "mock-*"],
      budget: {
        maxInputTokens: 20000
      },
      auditTags: ["external-action", "human-approval"],
      dataClass: "public",
      approval: {
        required: true,
        mode: "live",
        reason: "External action routes may call tools, automations, or third-party platforms."
      }
    }
  };
}

function normalizeSkillName(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "new_skill";
}
