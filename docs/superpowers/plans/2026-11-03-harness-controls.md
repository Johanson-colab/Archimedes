# Harness Controls Implementation Plan

Owner requested the exact UI design and explicitly authorized editing/pushing main. Follow that instruction instead of the default PR workflow. Preserve the clean main checkout and do not force-push.

1. Add component regressions for the four harness entries, disabled unavailable adapters, settings gear, saved selection and native usage ring including unknown usage. Observe missing behavior before implementing.
2. Create `src/HarnessPicker.tsx` using shared Menu primitives, provider brand icons and saved backend selection. Replace composer reasoning/context selectors and verbose runtime text with it. Keep execution preferences in Models.
3. Rename the Settings tab Harnesses with Workflow icon. Use the shared usage ring classes in native context usage while retaining native token details and unknown state.
4. Run focused UI, locale and input-performance tests serially under bounded memory; run lint/build/theme checks. Capture matched component fixtures before/after. Review the changes, commit and push main without force.

Scope: Codex and Archimedes are available harnesses. Claude Code and OpenCode are visible, unavailable entries until their adapters exist. Switching does not launch a CLI; changing harnesses during execution is disabled.
