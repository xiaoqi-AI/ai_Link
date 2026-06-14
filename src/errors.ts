export class AiLinkError extends Error {
  constructor(
    message: string,
    public readonly code = "AI_LINK_ERROR",
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AiLinkError";
  }
}
