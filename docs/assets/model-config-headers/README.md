# Model settings and chat

## Review revision

The comparison uses the macOS Electron app with an identical 1180 × 900 content viewport, temporary profiles, and a disposable workspace. The before images use the original PR implementation after merging upstream, at `5d83c7e`. The after images use the review changes at `9bf88b5`. The provider list is scrolled to the bottom in both stages so the relevant entries are visible.

| Scenario | Before | After |
| --- | --- | --- |
| Select OpenCode Go in Charcoal | [Preset button in the Custom form](provider-charcoal-before.png) | [OpenCode Go selected in the provider list](provider-charcoal-after.png) |
| Test a connection without a session header in Chinese Paper | [English error](connection-paper-zh-before.png) | [Chinese recovery guidance](connection-paper-zh-after.png) |

The [saved OpenCode Go connection](connection-paper-go-after.png) passed **Test connection** after closing and reopening Models. The API key field showed the saved-key placeholder with an empty value. The loopback server received the test session ID, Archimedes User-Agent, and dummy authentication before save and after reopening. [Before observations](review-before.json) and [after observations](review-after.json) contain the viewport, visible feedback, and request metadata. The capture used a local fixture with external requests blocked.

### Proactive model settings

The Proactive model comparisons use the upstream settings panel and connection handler at `ae8c18d` for the before state and `1c0cf93` for the after state. Both stages used Chinese Paper at 1180 × 900, the same disposable configuration, and the same local fixture. The fixture returns HTTP 400 with `MissingSessionID`.

| Scenario | Before | After |
| --- | --- | --- |
| Change the Base URL | [The old connection's saved-key hint](proactive-changed-endpoint-before.png) | [The new endpoint asks for a key](proactive-changed-endpoint-after.png) |
| Test the saved connection | [Provider error](proactive-missing-session-before.png) | [Chinese recovery guidance](proactive-missing-session-after.png) |

The replacement endpoint remained a draft. Testing the original endpoint in each stage used the saved dummy credential with an empty API key field.

### Migrated Go model capabilities

Both Charcoal screenshots use English and a 1180 × 900 viewport. A temporary legacy Custom connection points at the canonical Go endpoint with `gpt-5.6-luna`. The before build at `5e30fee` already shows the migrated Go provider with only Standard context. The after build at `dc90298` restores Thinking effort and the Extra Long context option.

| Before | After |
| --- | --- |
| [Migrated provider with only Standard context](go-capabilities-before.png) | [Thinking effort and context length controls](go-capabilities-after.png) |

The desktop capability response and the request-builder tests confirm that High effort keeps its API parameter and Extra Long uses a 1,000,000-character cap. The capture blocks external requests and reads only fixture settings.

## Initial connection and chat evidence

Captured in Archimedes' macOS Electron app at a matching 1180 × 900 content viewport. The baseline is upstream `0637139`. Each run used a fresh profile, a disposable workspace and the same local OpenAI-compatible fixture with a dummy API key. The fixture responds with HTTP 400 and `MissingSessionID` when the session header is absent.

- **Charcoal settings** shows the top of the form with the Base URL guidance and the OpenCode Go preset.
- **Paper settings** shows the lower part of the same form after **Test connection**, with the session strategy and saved custom-header status on the updated screen.
- **Paper chat** sends the same message using the built-in Archimedes harness. After the change the fixture accepts the conversation session ID and returns its reply.

The updated form was saved and reopened before the Paper capture. The fixture received the connection-test ID and a separate ID for chat. Screenshots contain no credentials. The fixture does not test a subscription or production inference.

Geometry and connection outcomes are in `before-geometry.json` and `after-geometry.json`.
