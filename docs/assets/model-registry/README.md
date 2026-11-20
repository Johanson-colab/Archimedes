# Saved model profiles in Settings and the composer

Captured from the compiled macOS Electron app at a 1560 × 980 viewport in Paper and Charcoal. Both builds started with the same two legacy role configurations and a loopback API fixture. The baseline includes the revised provider support at `9bf88b5`.

| Surface and state | Paper | Charcoal |
| --- | --- | --- |
| Models on first open | [Before](paper-before-settings.png) · [After](paper-after-settings.png) | [Before](charcoal-before-settings.png) · [After](charcoal-after-settings.png) |
| Models with advanced profiles enabled | [Before](paper-before-settings.png) · [After](paper-after-advanced.png) | [Before](charcoal-before-settings.png) · [After](charcoal-after-advanced.png) |
| Bottom of the model form | [Before](paper-before-limits.png) · [After](paper-after-limits.png) | [Before](charcoal-before-limits.png) · [After](charcoal-after-limits.png) |
| Proactive model settings | [Before](paper-before-proactive.png) · [After](paper-after-proactive.png) | [Before](charcoal-before-proactive.png) · [After](charcoal-after-proactive.png) |
| New research composer with harness menu open | [Before](paper-before-composer.png) · [After](paper-after-composer.png) | [Before](charcoal-before-composer.png) · [After](charcoal-after-composer.png) |

The fixture saved two role assignments to one model, edited it through Proactive, and showed the updated model ID in the composer. The saved assignments, profile mode, and limits survived reload. Creating and deleting another named profile left the active Agent model intact. The related capture data records the app’s character estimate at the time of capture.

## Context budget and recovery

Both providers received the same prompt, twenty prior 51,000-character replies, and an ordinary built-in file tool. The configured 12,000-token window is estimated at 48,000 characters. Each value below counts the serialized request and reserves another 1,284 characters for the configured 321 output tokens.

| Provider | Before, initial | Before, tool result | After, initial | After, tool result |
| --- | ---: | ---: | ---: | ---: |
| OpenAI-compatible | 57,269 | 68,403 | 47,988 | 43,994 |
| Anthropic | 56,270 | 67,399 | 47,981 | 43,017 |

The follow-up request preserves the tool call and its matching result. A separate regression uses an escape-heavy JSON result and verifies the shortened preview fits after serialization. This check estimates text usage. The provider applies its own tokenizer and accounts for images.

The [before](paper-before-budget-error.png) and [after](paper-after-budget-error.png) captures show the same saved conversation reopened in Chinese at 1280 × 870 in the Paper theme. Both runs stop locally before sending a model request. The recovery message now follows the interface language.

[Captured observations](observations.json)
