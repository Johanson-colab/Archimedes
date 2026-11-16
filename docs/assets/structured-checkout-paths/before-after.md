# Structured checkout file evidence

These checks exercise structured file actions on synthetic local files. They
do not require starting a container or connecting to a user's server.

| Action | Upstream main `1f4b375` | This branch |
| --- | --- | --- |
| Docker structured read through `checkout/linked` pointing outside | Returned external `ORIGINAL` text | Rejected the external target |
| Docker structured write through the same link | Changed the external file to `OVERWRITTEN` | Rejected; external bytes remained intact |
| Docker write through a final file link | Followed the link in the original implementation | Rejected |
| Ordinary nested path containing an apostrophe | Existing supported operation | UTF-8 text written and read unchanged |
| Read-only Docker link resolving inside checkout | Existing supported operation | Still reads the internal target |
| SSH write/read through an external directory link | Original script used lexical path checks | Actual production shell script rejects the link |
| SSH structured read over 2 MiB | Unbounded full read | Explicit error before returning file content |

The before Docker observation ran the actual main backend on temporary files;
its result was `externalRead: "ORIGINAL"`, `externalAfterWrite: "OVERWRITTEN"`.
The focused after run passed all **12 tests**: two filesystem/production-shell
boundary tests plus ten existing SSH path/quoting/backend checks. The SSH test
runs the actual backend-generated command via local Bash instead of making a
network connection; stdin, apostrophe quoting and the on-target size check are
exercised against real files.

This is a nonvisual file-interface change. Arbitrary approved shell commands
retain their existing target-machine permissions; these checks describe the
structured file methods' checkout contract.
