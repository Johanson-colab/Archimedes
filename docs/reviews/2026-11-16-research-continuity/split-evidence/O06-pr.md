Keep partial model output as an incomplete turn instead of accepting it as a finished answer. Require an OpenAI completion reason or Anthropic stop event/reason with closed content blocks, and validate the whole tool-call batch before any call can execute. A disconnected, truncated or malformed response retains its received text and a structured failure; continuing creates a new turn. JSON review/planner requests apply the same completion check before their existing JSON repair pass.

Before/after using the same real completion entry point and controlled partial stream:

| | Upstream main | This change |
| --- | --- | --- |
| Partial text followed by `[DONE]`, without a completion reason | Returned the text as a complete response | `MODEL_RESPONSE_INCOMPLETE`, `missing_terminal`, with the same partial text retained |
| Requests | 1 | 1 |

Validation on macOS arm64 / Node 26.13.0:

- 21 protocol, real SQLite/agent, serializer/restore/continue and JSON-adapter checks pass. A mixed complete/partial tool batch executes zero tools; incomplete text/status survives persistence and cloud serialization. The original registry group also passes 10/10.
- Lint, build and theme checks passed. Standard `npm test`: 1276 tests, 1262 passed / the same 7 main-baseline failures / 7 conditional skips. Failures are Git/worktree 3, Windows-target shell 3 and translation ordering 1 (#337–339).
- Successful provider fixtures now include their completion metadata; existing business assertions are retained.

Split from #336.
