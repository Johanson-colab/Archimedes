# Models memory investigation — 2026-11-03

The owner reported high Electron/Archimedes and Codex memory usage while only
opening Models, without checking or enabling the Codex backend. The original
incident has **not** been reproduced or completely attributed. These findings
must not be represented as a complete application-memory fix.

## Confirmed test-side hazard

An initially incorrect presence assertion compared a live React DOM node with
`null`. Node 25's assertion formatter uses `depth: 1000`, unlimited array length,
and getters when printing differences. Traversing enumerable React Fiber/DOM
references caused pathological test CPU/memory behavior. Additional test runs
were started before the earlier runs had completed, amplifying resource pressure.

The incorrect selector was corrected, and all remaining live-DOM equality
assertions in the new settings tests now compare booleans or primitive values.
A source-level regression check was observed failing on the five remaining
unsafe assertions before the fix, then passing after it. This explains a
test-side failure mechanism, not necessarily both applications' reported usage.

## Bounded verification

No full test suite, Vite rebuild, screenshot batch, or real native-agent call was
run concurrently during this investigation. A separate watchdog bounded runtime
and sampled the entire diagnostic process tree's RSS; tests also used a 192 MiB
V8 old-space limit and single test-file concurrency. Watchdog limits are sampling
limits, not operating-system hard memory quotas.

Fresh focused result: **11 passed, 0 failed**, approximately 2.9 seconds;
sampled peak process-tree RSS **332 MiB**. This includes 25 ordinary mount/unmount
cycles and 25 development StrictMode cycles. StrictMode heap delta after explicit
GC was **+1.12 MiB**. Configuration loads remained bounded (twice per StrictMode
mount), with **zero automatic Codex checks or backend saves**.

The existing production renderer build was also exercised in one isolated
Electron instance, without native preload credentials or real workspace data.
The script used a disposable profile, a 1000×760 viewport at device scale 1,
software rendering, and a 128 MiB renderer old-space limit. Across 55 cycles of
opening Settings, opening Models, switching API/Agent tabs and closing Settings:

| After warmup / total cycles | GC heap | DOM nodes | JS listeners |
| --- | --- | --- | --- |
| 5 | 7.49 MiB | 753 | 357 |
| 30 | 7.70 MiB | 753 | 357 |
| 55 | 7.78 MiB | 753 | 357 |

Renderer working set decreased from approximately 332 MiB after warmup to
271 MiB at the end. Sampled **whole process tree** peak was approximately
800 MiB; this includes Chromium's main, GPU, utility and renderer processes and
is not equivalent to unique physical-memory usage. Earlier attempts with lower
512/768 MiB tree thresholds terminated automatically before completing the
audit; they did not establish a leak. The final run completed under a 1024 MiB
tree threshold in approximately 11.6 seconds, then exited normally.

## Remaining uncertainty

This does not exclude leaks involving Vite HMR, long-running sessions, real
workspace/history contents, or Codex desktop itself. It does not profile native
Codex execution, since the owner had not used it at the time of the incident.
No production runtime memory fix was guessed from the test-side evidence.
No diagnostic Electron, Vite, or test processes remained at the final process
check. These findings do not claim that the original incident is resolved. The
owner subsequently requested publication in PR #234 and integration into main;
the unresolved application-memory concern remains explicit in the handoff.
