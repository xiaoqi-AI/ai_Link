import type { PolicyConfig, RunRequest } from "../types.js";

export interface SensitiveFinding {
  label: string;
  pattern: string;
}

const DEFAULT_PATTERNS: SensitiveFinding[] = [
  { label: "private-key", pattern: "-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----" },
  { label: "aws-access-key", pattern: "\\bAKIA[0-9A-Z]{16}\\b" },
  { label: "openai-like-secret", pattern: "\\bsk-[A-Za-z0-9_-]{20,}\\b" },
  { label: "bearer-token", pattern: "\\bBearer\\s+[A-Za-z0-9._~+/=-]{20,}\\b" },
  { label: "env-secret-assignment", pattern: "\\b[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)\\s*=\\s*[^\\s]+" },
  { label: "credential-json-field", pattern: "\"(?:apiKey|api_key|token|secret|password)\"\\s*:\\s*\"[^\"]+\"" }
];

export function scanSensitiveText(text: string, policy: PolicyConfig = {}): SensitiveFinding[] {
  if (policy.blockSensitive === false) {
    return [];
  }

  const patterns = [
    ...DEFAULT_PATTERNS,
    ...(policy.blockPatterns ?? []).map((pattern) => ({ label: "custom", pattern }))
  ];

  return patterns.filter((finding) => new RegExp(finding.pattern, "i").test(text));
}

export function collectOutboundText(request: RunRequest): string {
  return [
    request.system ?? "",
    request.input ?? "",
    ...(request.messages ?? []).map((message) => message.content)
  ].join("\n");
}
