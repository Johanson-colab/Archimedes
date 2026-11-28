# One-shot conference open

Clicking “Browse full proceedings” used to leave `dailyStartMode` set to `conference`. Because the mode was part of the Daily view's React key, every subsequent project switch remounted Daily with that override and overwrote the new project's saved Latest/Trending mode.

The fix keys the Daily view by an explicit-open request counter and consumes the mode override in a layout effect right after the target view mounts. No timer or listener is introduced. The regression checks the App wiring and mounts Daily for two project scopes: the explicit conference view survives a prop reset, while the next project gets its own saved Daily view.

Both logs are from the discovery project-state suite at branch head `0e3ef0fe`; the before run is filtered to the new test, and the after run is the full focused file.
