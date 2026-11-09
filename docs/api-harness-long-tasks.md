# API harness long-task foundations

Before a new turn, recent persisted assistant tool calls and their results are restored as matching protocol messages. Only complete groups are restored, with a bounded per-turn and overall size. Isolated worker events are not mixed into the main conversation. Earlier conversation turns still follow the existing context selection and summary limits; this is a character budget, not an exact token count.

Model requests retry up to twice for network errors, 429, 500, 502, 503 and 504 before a response stream starts. Retry-After is honored up to ten seconds. Cancellation interrupts the wait. Streams already in progress and tool or command executions are not replayed by this retry mechanism.

IdeaSpark records phase start, finish, incomplete output and failure/interruption events, and retains its run directory between turns. These records are an audit trail, not automatic execution checkpoints: after a failure or interruption, the agent must inspect the navigator and artifacts before continuing. The current implementation does not yet provide full automatic stage recovery or dynamic token-aware compaction during an active turn.
