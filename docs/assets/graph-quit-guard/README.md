# Graph extraction during quit

`scheduleGraphAutoBuild()` used to fire an unawaited extraction after the research turn was removed from active runs, so quitting immediately after a project-backed turn could exit before the model call finished. The extraction is now registered as a graph-domain active run and released only in the build's `finally`, so the quit guard sees it and shutdown waits for cleanup.

The before output applies the new source assertion to `git show HEAD:electron/agent.cjs`; the after output is the focused active-run test.
