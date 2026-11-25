# Structured files in reproduction checkouts

Docker structured writes stay inside the checkout and reject symbolic links
in parent directories or the final file. Reads may use an internal link when
its actual target remains inside the checkout. SSH structured reads and writes
reject linked path components. New ordinary directories and UTF-8 filenames,
including spaces and apostrophes, remain supported. Writes to `.git` and
traversal paths are rejected.

Structured reads return files up to 2 MiB. Larger data requires an explicit
paged shell command; it is not returned as an apparently complete partial
document. A missing file still returns no content for the checkpoint caller.
