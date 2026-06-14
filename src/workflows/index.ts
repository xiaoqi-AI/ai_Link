import { AiLinkError } from "../errors.js";
import { runAiLink } from "../router/index.js";
import type {
  AiLinkConfig,
  WorkflowRunRequest,
  WorkflowRunResult,
  WorkflowStageConfig,
  WorkflowStageResult
} from "../types.js";

const KNOWN_STAGE_ORDER = [
  "research",
  "article_draft",
  "agent_flow",
  "image_followup",
  "code_reasoning",
  "general"
];

export async function runWorkflow(
  config: AiLinkConfig,
  request: WorkflowRunRequest
): Promise<WorkflowRunResult> {
  const stages = resolveWorkflowStages(config, request.workflow, request.stages);
  const results: WorkflowStageResult[] = [];

  for (const stage of stages) {
    const task = stage.task ?? `${request.workflow}.${stage.name}`;
    const inputFrom = stage.inputFrom ?? (results.length === 0 ? "original" : "original-and-previous");
    const result = await runAiLink(config, {
      task,
      input: buildStageInput(request.input, results, inputFrom),
      system: stage.system ?? request.system,
      provider: request.provider ?? stage.provider,
      model: request.model ?? stage.model,
      dryRun: request.dryRun,
      allowSensitive: request.allowSensitive
    });

    results.push({
      name: stage.name,
      task,
      inputFrom,
      result
    });
  }

  return {
    workflow: request.workflow,
    dryRun: request.dryRun ?? false,
    stages: results
  };
}

export function resolveWorkflowStages(
  config: AiLinkConfig,
  workflowName: string,
  requestedStages: string[] = []
): WorkflowStageConfig[] {
  if (!workflowName) {
    throw new AiLinkError("Workflow name is required.", "CLI_USAGE");
  }

  const configured = config.workflows?.[workflowName]?.stages ?? [];
  if (requestedStages.length > 0) {
    return requestedStages.map((stageName) => {
      const configuredStage = configured.find((stage) => stage.name === stageName || stage.task === stageName);
      return configuredStage ?? {
        name: normalizeStageName(workflowName, stageName),
        task: stageName.includes(".") ? stageName : `${workflowName}.${stageName}`
      };
    });
  }

  if (configured.length > 0) {
    return configured;
  }

  const inferred = Object.keys(config.routes ?? {})
    .filter((task) => task.startsWith(`${workflowName}.`))
    .map((task) => ({
      name: normalizeStageName(workflowName, task),
      task
    }))
    .sort((left, right) => stageOrder(left.name) - stageOrder(right.name));

  if (inferred.length > 0) {
    return inferred;
  }

  throw new AiLinkError(`Workflow "${workflowName}" has no configured or inferred stages.`, "WORKFLOW_NOT_FOUND");
}

function buildStageInput(
  originalInput: string | undefined,
  previousStages: WorkflowStageResult[],
  inputFrom: WorkflowStageConfig["inputFrom"]
): string | undefined {
  const original = originalInput?.trim() ?? "";
  const previous = previousStages
    .map((stage) => `## ${stage.name}\n${stage.result.output}`)
    .join("\n\n")
    .trim();

  if (inputFrom === "previous") {
    return previous || undefined;
  }

  if (inputFrom === "original-and-previous" && previous) {
    return [
      original ? `# Original input\n${original}` : "",
      `# Previous stage outputs\n${previous}`
    ].filter(Boolean).join("\n\n");
  }

  return original || undefined;
}

function normalizeStageName(workflowName: string, value: string): string {
  return value.startsWith(`${workflowName}.`) ? value.slice(workflowName.length + 1) : value;
}

function stageOrder(stageName: string): number {
  const index = KNOWN_STAGE_ORDER.indexOf(stageName);
  return index === -1 ? KNOWN_STAGE_ORDER.length : index;
}
