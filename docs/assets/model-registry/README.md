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

Separate loopback checks after review use four estimated characters per configured input token. A 6,000-token profile completed a follow-up after twenty replies of about 51,000 characters, including a tool round. Both requests reached the fixture at 24,000 serialized message characters with `max_tokens: 321`. A fresh 32,768-token profile accepted a 44,760-character request and sent its configured `max_tokens: 16384`.

[Captured observations](observations.json)
