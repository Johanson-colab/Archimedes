const names = { codex: "Codex", claude: "Claude Code", opencode: "OpenCode" };

class NativeSessionBusyError extends Error {
  constructor(backend) {
    super(`Another workspace is using this ${names[backend]} conversation. Wait for its active turn to finish.`);
    this.backend = backend;
  }
}

module.exports = { NativeSessionBusyError };
