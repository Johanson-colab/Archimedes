# Failed queued turns keep their order

When a queued turn failed while later follow-ups remained queued, the composer restored the failed message into the editor and left the later message at the queue head. “Retry queued messages” then sent the follower first. The failure now restores into the editor only when no later queued message exists; otherwise the failed turn stays at the head and retries before its followers.

The regression extends the existing Work composer harness with a failed turn that has a follower and verifies the retry order. Logs use `node --test electron/work-composer-attachments.test.cjs`.
