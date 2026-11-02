# Codex Agent backend (issue #233)

## Scope and authorization

Issue: https://github.com/Johanson-colab/Archimedes/issues/233

The repository owner explicitly requested creating an issue and developing an
external Agent backend in a new PR. That written request is recorded in the
issue's final paragraph. This PR implements Codex first; it does not merge or
push directly to main.

## Design

- Preserve the API harness as the default and for internal research workers.
- Add an opt-in Codex app-server adapter for main Work conversations.
- Keep configuration free of copied Codex credentials and use local CLI auth.
- Persist backend/native-thread bindings separately from public chat history.
- Stream native output into existing research events, with explicit error and
  cancellation states. Never replay a turn automatically after uncertain delivery.
- Start with a restricted sandbox, bridge supported approvals, deny unknown
  requests, and keep read-only conversations out of the external execution path.
- Reset native continuity when local history is undone/forked or the backend or
  workspace changes; preserve old native history rather than deleting it.

Protocol reference: https://learn.chatgpt.com/docs/app-server

## Verification

Implementation and verification results will be recorded here as development
progresses. Native tools do not automatically inherit Archimedes' API tools;
unsupported attachment/tool paths must be disclosed rather than silently ignored.
