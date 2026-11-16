# Discovery query-state evidence

Both images render the actual `ConferenceDiscovery` component at 1100×700,
Charcoal and English, with the same controlled bridge and catalog fixture. The
sequence is identical: load ICML, switch to NeurIPS whose request stays pending,
then switch back to ICML.

- `before.png` uses `8d4dea2`: switching back hits the old single cached key and
  returns without clearing `loading`, so the view is stranded on
  "Loading the official ICML 2026 catalog…".
- `after.png` uses this PR: the cached ICML response is restored for its own
  filter key and loading is cleared; the matching paper list is visible.

The deferred NeurIPS request is a controlled fixture, not a real network query.
Stale-result hiding after a failed query and the explicit-conference mode
precedence are covered by `electron/discovery-project-state.test.cjs`.
