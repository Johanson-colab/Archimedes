# Saved model profiles in Settings and the composer

Captured from the compiled macOS Electron app at a 1560 × 980 viewport in Paper and Charcoal. Both builds started with the same two legacy role configurations and a loopback API fixture. The baseline includes the revised provider support at `9bf88b5`.

| Surface and state | Paper | Charcoal |
| --- | --- | --- |
| Models on first open | [Before](paper-before-settings.png) · [After](paper-after-settings.png) | [Before](charcoal-before-settings.png) · [After](charcoal-after-settings.png) |
| Models with advanced profiles enabled | [Before](paper-before-settings.png) · [After](paper-after-advanced.png) | [Before](charcoal-before-settings.png) · [After](charcoal-after-advanced.png) |
| Bottom of the model form | [Before](paper-before-limits.png) · [After](paper-after-limits.png) | [Before](charcoal-before-limits.png) · [After](charcoal-after-limits.png) |
| Proactive model settings | [Before](paper-before-proactive.png) · [After](paper-after-proactive.png) | [Before](charcoal-before-proactive.png) · [After](charcoal-after-proactive.png) |
| New research composer with harness menu open | [Before](paper-before-composer.png) · [After](paper-after-composer.png) | [Before](charcoal-before-composer.png) · [After](charcoal-after-composer.png) |

The fixture saved two role assignments to one model, edited it through Proactive, and showed the updated model ID in the composer. The saved assignments, profile mode, and limits survived reload. Creating and deleting another named profile left the active Agent model intact. After four replies of about 51,000 characters each, the next loopback request contained 24,000 serialized message characters and `max_tokens: 321`.

[Captured observations](observations.json)
