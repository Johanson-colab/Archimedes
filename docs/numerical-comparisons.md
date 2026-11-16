# Compare recorded numerical results

Open a reproduction and select a recorded run. **Numerical comparisons** is
available for both the current run and a selected historical run. The
reproduction must be bound to a local project workspace. Saving a comparison
adds an independent evidence record; it does not change the run's checkpoint
status or certify that the paper has been scientifically reproduced.

Choose a UTF-8 CSV or a JSON array of flat records. Supported inputs are at
most 2 MiB, 10,000 rows and 100 uniquely named columns. Values are captured
when selected, and the preview shows the file hash and sample rows. Saving
copies those captured bytes, even if the original file later changes. The
file is explicitly user-selected evidence: linking it to a run does not
establish that the run produced it.

Confirm the expected and actual value columns, an optional metric/claim
label, unit, dataset and absolute tolerance. Unit/dataset can come from a
column or a user-entered fixed value. Separate actual unit/dataset columns
can be selected; otherwise the confirmed common values apply to both sides.
Tolerance can come from a column or a fixed nonnegative decimal. Common
column names are prefilled for convenience, but saving requires explicit
confirmation. Units are compared as recorded; the app does not infer unit
conversions, dataset equivalence or the meaning of a metric.

Rows have four outcomes:

- **Missing value:** an expected or actual value is absent.
- **Incomparable:** numbers/tolerance are invalid or outside supported
  precision, or unit/dataset information is missing or differs.
- **Within tolerance:** the exact absolute difference is at most the
  confirmed tolerance.
- **Outside tolerance:** the exact difference exceeds that tolerance.

Decisions use bounded exact decimal arithmetic, including scientific
notation. CSV values, JSON numeric literals and the fixed tolerance retain
their decimal text. Binary floating-point rounding and extra hidden epsilon
are not used. For example, `0.7 → 0.8` with tolerance `0.1` is within, while
`10000000000000000 → 10000000000000002` with tolerance `1` is outside, and
`1 → 1.0000000000000001` with zero tolerance is outside. Parsing supports up
to 1,000 coefficient digits and exponent magnitude 1,000; rows beyond those
bounds remain incomparable rather than being rounded into a pass.

Each saved report retains the mapping, exact value/difference strings, row
outcomes, original data hash and attached run-snapshot hash. Reports and
source copies live under the data workspace's
`.archimedes/metric-comparisons/<run-id>/<comparison-id>/`. History listing
returns metadata first; opening one report loads its result rows. The UI
pages results without changing the complete saved computation.

Opening or refreshing a report checks its source and attached run snapshot.
Changed/missing evidence or a different run snapshot marks the report stale
while keeping its original results. A run gaining its final receipt can
therefore make an earlier comparison stale. Reconfirm the mapping and save
another comparison when a new attachment is appropriate. Export comparison
JSON for inspection or use **Transfer project → Reproduction history** to
carry both reports and source files into another local project.

Project restoration assigns new owners/run IDs and preserves comparison
values/source hashes. The report keeps its original attached snapshot hash,
so it is visibly historical/stale after restoration, with a restoration
marker. It is never silently relabeled as fresh execution in the new folder.
