## Split review index — unfinished

This PR is closed and was not merged. Following the request for independent PRs, **21 reviews were created: 18 upstream and 3 in the contributor fork; 18 remain open**. #343, #344 and #349 are closed/deferred; their branches and code are retained and excluded from future integration. This index records partial progress, not completion or readiness to merge. Original description and discussions are retained below.

### Created upstream reviews

| Feature | PR |
| --- | --- |
| Canonical Git workspace identity | [#337](https://github.com/Johanson-colab/Archimedes/pull/337) |
| Windows terminal target paths | [#338](https://github.com/Johanson-colab/Archimedes/pull/338) |
| Translation shard order | [#339](https://github.com/Johanson-colab/Archimedes/pull/339) |
| Work modes and actual next-message mode | [#340](https://github.com/Johanson-colab/Archimedes/pull/340) |
| Asynchronous data-store ownership | [#341](https://github.com/Johanson-colab/Archimedes/pull/341) |
| Project discovery search state | [#342](https://github.com/Johanson-colab/Archimedes/pull/342) |
| Source Node/npm toolchain | [#343](https://github.com/Johanson-colab/Archimedes/pull/343) — closed/deferred |
| Project paper selection and provenance | [#344](https://github.com/Johanson-colab/Archimedes/pull/344) — closed/deferred |
| Explicit desktop runtime preparation | [#345](https://github.com/Johanson-colab/Archimedes/pull/345) |
| BibTeX interchange and local PDF identity | [#346](https://github.com/Johanson-colab/Archimedes/pull/346) |
| Manuscript compilation source receipts | [#347](https://github.com/Johanson-colab/Archimedes/pull/347) |
| Continue multi-file manuscripts | [#348](https://github.com/Johanson-colab/Archimedes/pull/348) |
| Build identity diagnostics | [#349](https://github.com/Johanson-colab/Archimedes/pull/349) — closed/deferred |
| Owned file drafts and saves | [#350](https://github.com/Johanson-colab/Archimedes/pull/350) |
| Research App enable/configuration routing | [#351](https://github.com/Johanson-colab/Archimedes/pull/351) |
| Snapshot read budgets | [#352](https://github.com/Johanson-colab/Archimedes/pull/352) |
| Docker/SSH structured file boundaries | [#353](https://github.com/Johanson-colab/Archimedes/pull/353) |
| Incomplete responses and tool batches | [#354](https://github.com/Johanson-colab/Archimedes/pull/354) |

### Created fork reviews

| Feature | Review | Dependency |
| --- | --- | --- |
| Atomic project/session execution selection | [fork #1](https://github.com/feiiiiii5/Archimedes/pull/1) | [upstream #341](https://github.com/Johanson-colab/Archimedes/pull/341) |
| Manuscript citations and `.bib` updates | [fork #2](https://github.com/feiiiiii5/Archimedes/pull/2) | [upstream #348](https://github.com/Johanson-colab/Archimedes/pull/348) + [#346](https://github.com/Johanson-colab/Archimedes/pull/346); later dependency follow-ups still need reconciliation |
| Conversation drafts, attachments and owned notes | [fork #3](https://github.com/feiiiiii5/Archimedes/pull/3) | [fork #1](https://github.com/feiiiiii5/Archimedes/pull/1) |

Fork #1/#3 include the updated ownership dependency chain. GitHub cannot retarget these fork-repository reviews across repositories; eventual upstream submissions require fresh upstream-main branches/PRs linked to the reviews.

### Unfinished

Highest priority in #354: planner consumers can accept incomplete output as a contract, and incomplete journeys can display Completed; these findings remain unresolved.

Remote review findings remain open; these PRs are not a uniformly ready-to-merge set. Analysis persistence/discussion (O14), manuscript review/revision (O18) and manuscript-to-slides preparation (O19) remain local checkpoints and are **not opened PRs**. Other planned splits, including recovery/reproduction, figures, transfer, synchronization, named versions and the research index, remain unfinished.

The final union of split branches has **not** been integrated or validated; earlier whole-branch test/package results do not establish that union's correctness.
