# Model settings and chat

Captured in Archimedes' macOS Electron app at a matching 1180 × 900 content viewport. The baseline is upstream `0637139`. Each run used a fresh profile, a disposable workspace and the same local OpenAI-compatible fixture with a dummy API key. The fixture responds with HTTP 400 and `MissingSessionID` when the session header is absent.

- **Charcoal settings** shows the top of the form with the Base URL guidance and the OpenCode Go preset.
- **Paper settings** shows the lower part of the same form after **Test connection**, with the session strategy and saved custom-header status on the updated screen.
- **Paper chat** sends the same message using the built-in Archimedes harness. After the change the fixture accepts the conversation session ID and returns its reply.

The updated form was saved and reopened before the Paper capture. The fixture received the connection-test ID and a separate ID for chat. Screenshots contain no credentials. The fixture does not test a subscription or production inference.

Geometry and connection outcomes are in `before-geometry.json` and `after-geometry.json`.
