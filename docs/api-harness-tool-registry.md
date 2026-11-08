# API harness tool registry

The main API agent advertises and invokes its built-in tools through
`ToolRegistry`. A trusted host integration can register an MCP or Research App
adapter against the same interface. Names must be unique, definitions are copied
on registration, and external adapters must provide an authorization function.
Authorization must resolve to the boolean `true`; cancellation while waiting
prevents execution. Adapters must propagate the provided abort signal to any
operation they start.

Each invocation records a correlated `tool_call` and `tool_result` with source,
status and duration, and emits corresponding live activity. Invalid arguments,
denied permissions and executor errors produce failed results. The registry
bounds argument and result sizes. It accepts the documented JSON Schema subset
implemented in `tool-registry.cjs`; unsupported schema keywords fail at
registration rather than silently bypassing validation. An adapter for a richer
schema must normalize or independently validate that schema before registering.

This is an integration interface, not an MCP server manager or Research App
runtime. The real adapter must supply its own connection, capability grants,
authorization UI, cancellation and result conversion. Registration is an
in-process host API and is not exposed to renderer-supplied code.

Run `node --test electron/agent/tool-registry.test.cjs
electron/agent/command-runner.test.cjs electron/agent/workspace-tools.test.cjs`
to exercise built-ins and mock MCP/App adapters through the actual API loop.
