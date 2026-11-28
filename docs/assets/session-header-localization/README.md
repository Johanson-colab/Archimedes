# Session-header recovery localization verification

Verified on 2026-11-28 on branch `codex/model-headers-357` at `f9582893` plus the fix in this branch. This is a main-process error-code and renderer text change, so the evidence is before/after test output.

## Scenario

A Chinese user hitting `MissingSessionID` during a normal chat or Paper review turn received English-only recovery guidance. Test connection already used a stable `Connection failed (status): MissingSessionID` code and translated it, but ordinary model requests embedded the English guidance directly in the assistant response and review error.

The fix exports that fixed guidance string from `electron/model-request-headers.cjs`, tags the agent failure with `MODEL_SESSION_HEADER_REQUIRED`, records a `model_session_header_required` event, and adds the English-key/Chinese-value entry in `src/i18n/translations/agent.ts`. Chat translates the coded live event and a saved assistant message equal to the guidance string; Paper review translates its stored error through the existing `reviewError()` boundary.

## Focused regressions

Before (source edits stashed, new tests kept):

```text
node --test electron/model-request-headers.test.cjs electron/i18n-translations.test.cjs
✖ session-header recovery guidance is translated at every display boundary
  actual: '' expected: /[一-鿿]/
✖ provider session errors get actionable messages
  Expected 'This provider requires a stable session header. …' to equal undefined
```

After:

```text
node --test electron/model-request-headers.test.cjs electron/i18n-translations.test.cjs electron/model-backend-settings.test.cjs electron/model-response-json.test.cjs electron/native-session-busy.test.cjs
ℹ tests 43
ℹ pass 43
ℹ fail 0
```

The first full-suite rerun caught a missing `requiresSessionHeader` export from the header module; two agent tests failed with `TypeError: requiresSessionHeader is not a function`. The export was added and both tests now pass.

## Project gates

- `npm run lint`: passed after a forced TypeScript rebuild cleared stale incremental state from the ambient type addition.
- `npm run build`: passed, with the existing large-chunk warning.
- `npm run check:theme`: passed.
- `npm test`: 1,696 tests, 1,690 passed, 0 failed, 6 skipped. The suite needs local socket access because the sandbox rejects `127.0.0.1` binding in the collaboration-server tests.
