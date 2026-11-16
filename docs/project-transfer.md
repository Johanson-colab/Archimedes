# Move a local project

Open the project's menu and choose **Transfer project**. Export produces a
movable `.archimedes-project` folder containing `manifest.json`,
`records.json`, and content-addressed `blobs/`. Keep the entire folder
together when copying it to another machine.

Project and literature metadata are included. Select PDFs/indexed text,
annotations, reviews/presentations, conversations, analysis/figure packages,
conversation artifacts and reproduction history. Add manuscript source files
or a manuscript directory explicitly. The picker accepts the project's
persisted workspaces and its accessible sessions' historical directories.
It excludes configuration, credential files and environment caches. Source
files are copied from disk: save editor drafts before exporting.

Preview shows record counts, file hashes, copied bytes and unavailable
resources. Missing files, remote-only artifacts/logs, changed PDFs whose text
index no longer matches, and legacy review runs without a verified data
workspace are listed explicitly. They are not silently replaced by another
file. Files with identical contents share one blob. A package is limited to
10,000 selected resource references, 500 MiB of distinct file contents and
25 MiB of JSON records. This is a project migration format, not an operating
system, Git checkout or installed-environment backup.

In the destination data workspace, choose **Restore project folder** and
select the package. Its manifest, counts and every included file hash are
checked before the target chooser. Select a parent directory and a project
name. Restoration creates a new project, new local IDs and a new unique
directory; it does not merge into or overwrite an existing project. Existing
project names receive a distinct restored suffix. Sessions keep their own
restored working directories, including historical roots that differ from
the current default workspace.

PDF/annotation links, conversations, reading notes and internal result
references are remapped. Analysis/figure packages receive new registered
owners and file paths and remain editable. A source/output that was missing
or externally changed still appears missing/changed after restoration; a
partial package does not acquire a false ready receipt. Manuscript review
inputs retain their PDF/log/source receipt and the new historical run
reference, so preview cleanup cannot discard them.

When a paper is collected or imported again, matching DOI/arXiv/S2 identifiers
reuse the destination library/project's restored paper before global lookup.
Its notes, attached PDF and project selection stay with that local identity.
BibTeX preview and explicitly selected metadata repairs use that same target.

Cloud links, membership grants, pending synchronization outboxes, credentials,
native agent session bindings, pending approvals and live resource ownership
are excluded. Restored projects are local; share them again explicitly if
desired. Running conversations/runs become interrupted history, and the
reproduction summary is cancelled. No previous container, SSH session, PID or
lease can resume or be cleaned by opening the restored project. A migrated
run snapshot carries an explicit restoration marker and its original owner/
checkout metadata; it is historical evidence, not proof of execution in the
restored directory. Selected code files can be copied separately, while the
installed environment and remote files require separate preparation.

Configuration exclusions are structural. The exporter does not search for
or redact secrets a user has written into selected research prose, images or
datasets. Review selected content before sharing a package with someone
else.
