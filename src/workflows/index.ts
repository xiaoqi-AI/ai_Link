import { AiLinkError } from "../errors.js";
import { runAiLink } from "../router/index.js";
import type {
  AiLinkConfig,
  WorkflowRunRequest,
  WorkflowRunResult,
  WorkflowStageApprovalResult,
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
  const startIndex = resolveStartIndex(stages, request);
  const seedStages = seedResumeStages(stages, request.previousStages ?? [], startIndex);
  const previousStageCount = seedStages.length;
  const results: WorkflowStageResult[] = [...seedStages];
  const stagesToRun = stages.slice(startIndex);

  if (stagesToRun.length === 0) {
    throw new AiLinkError(
      `Workflow "${request.workflow}" has no remaining stages to run. Use --from-stage to rerun a stage.`,
      "WORKFLOW_RESUME_COMPLETE"
    );
  }

  for (const stage of stagesToRun) {
    const task = stage.task ?? `${request.workflow}.${stage.name}`;
    const inputFrom = stage.inputFrom ?? (results.length === 0 ? "original" : "original-and-previous");
    const stageApproved = isStageApproved(request, stage, task);
    const approval = resolveStageApproval(request, stage, task, stageApproved);
    const result = await runAiLink(config, {
      task,
      input: buildStageInput(request.input, results, inputFrom),
      system: stage.system ?? request.system,
      provider: request.provider ?? stage.provider,
      model: request.model ?? stage.model,
      dryRun: request.dryRun,
      allowSensitive: request.allowSensitive,
      approvePolicy: stageApproved
    });

    results.push({
      name: stage.name,
      task,
      inputFrom,
      source: "current",
      approval: approval ?? result.approval,
      result
    });
  }

  const resume = request.previousStages && request.previousStages.length > 0
    ? {
        fromRecordId: request.resumeFromRecordId,
        startAtStage: stages[startIndex]?.name ?? "",
        previousStageCount
      }
    : undefined;

  return {
    workflow: request.workflow,
    dryRun: request.dryRun ?? false,
    resume,
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

function resolveStageApproval(
  request: WorkflowRunRequest,
  stage: WorkflowStageConfig,
  task: string,
  approved: boolean
): WorkflowStageApprovalResult | undefined {
  if (!stage.approval?.required) {
    return undefined;
  }

  const mode = stage.approval.mode ?? "always";
  if (mode === "live" && request.dryRun) {
    return {
      required: true,
      approved: false,
      enforced: false,
      mode,
      reason: stage.approval.reason
    };
  }

  if (!approved) {
    throw new AiLinkError(
      `Workflow stage "${stage.name}" requires approval. Add --approve-stage ${stage.name} or --approve-all.`,
      "WORKFLOW_APPROVAL_REQUIRED",
      {
        workflow: request.workflow,
        stage: stage.name,
        task,
        mode,
        reason: stage.approval.reason
      }
    );
  }

  return {
    required: true,
    approved: true,
    enforced: true,
    mode,
    reason: stage.approval.reason
  };
}

function isStageApproved(
  request: WorkflowRunRequest,
  stage: WorkflowStageConfig,
  task: string
): boolean {
  return Boolean(request.approveAll)
    || (request.approvedStages ?? []).some((value) => value === stage.name || value === task);
}

function resolveStartIndex(stages: WorkflowStageConfig[], request: WorkflowRunRequest): number {
  if (request.startAtStage) {
    const index = findStageIndex(stages, request.startAtStage);
    if (index === -1) {
      throw new AiLinkError(`Workflow stage not found: ${request.startAtStage}`, "WORKFLOW_STAGE_NOT_FOUND");
    }
    return index;
  }

  if (!request.previousStages || request.previousStages.length === 0) {
    return 0;
  }

  const previousIndexes = request.previousStages
    .map((stage) => findStageIndex(stages, stage.name) !== -1 ? findStageIndex(stages, stage.name) : findStageIndex(stages, stage.task))
    .filter((index) => index !== -1);

  if (previousIndexes.length === 0) {
    throw new AiLinkError(
      `Resume record has no stages that match workflow "${request.workflow}".`,
      "WORKFLOW_RESUME_MISMATCH"
    );
  }

  return Math.max(...previousIndexes) + 1;
}

function seedResumeStages(
  stages: WorkflowStageConfig[],
  previousStages: WorkflowStageResult[],
  startIndex: number
): WorkflowStageResult[] {
  return previousStages
    .filter((stage) => {
      const index = findStageIndex(stages, stage.name) !== -1 ? findStageIndex(stages, stage.name) : findStageIndex(stages, stage.task);
      return index !== -1 && index < startIndex;
    })
    .map((stage) => ({
      ...stage,
      source: "resume" as const
    }))
    .sort((left, right) => findStageIndex(stages, left.name) - findStageIndex(stages, right.name));
}

function findStageIndex(stages: WorkflowStageConfig[], stageNameOrTask: string): number {
  return stages.findIndex((stage) => stage.name === stageNameOrTask || stage.task === stageNameOrTask);
}

function normalizeStageName(workflowName: string, value: string): string {
  return value.startsWith(`${workflowName}.`) ? value.slice(workflowName.length + 1) : value;
}

function stageOrder(stageName: string): number {
  const index = KNOWN_STAGE_ORDER.indexOf(stageName);
  return index === -1 ? KNOWN_STAGE_ORDER.length : index;
}
