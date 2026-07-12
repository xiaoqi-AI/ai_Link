export class MockGitHubConnector {
  constructor() {
    this.mode = "mock";
  }

  async checkAuth() {
    return {
      schema_version: "1",
      platform: "github",
      operation: "check_auth",
      status: "ready",
      session: {
        state: "valid",
        checked_at: new Date().toISOString()
      },
      items: [],
      action_required: null,
      diagnostics: {
        item_count: 0
      }
    };
  }
}
