# OpenAI models in Work

Choose **GPT-6.2 Sol** in Settings → Models to use the current general-purpose Sol model. Work sends the selected reasoning effort on the first request, including turns with local function tools. A dated model ID uses its family's protocol and keeps its exact ID on every request.

| Official API model | Work endpoint | Request behavior |
| --- | --- | --- |
| GPT-6.2 Sol / Astra, GPT-6.1 Sol / Terra, GPT-6 Sol / Astra / Luna | Responses | Stream text and function calls with the selected effort. GPT-6.2 rejects `none`. |
| GPT-5.6 Sol / Terra / Luna, GPT-5.5, GPT-5.4 / mini / nano, GPT-5.3-Codex, GPT-5.2, GPT-5.1, GPT-5 / mini / nano, o3 | Responses | Stream text and function calls. Availability of older models depends on the account and retirement date. |
| GPT-5 Pro, GPT-5.2 Pro, GPT-5.4 Pro, GPT-5.5 Pro, o3-pro | Responses | Use high effort for GPT-5 Pro. The later GPT Pro models offer medium and high in Work. GPT-5.5 Pro and o3-pro return a complete response without streaming. |
| GPT-4.1 / mini, GPT-4o / mini, Chat Latest | Chat Completions | Send function definitions without a reasoning parameter. |

The Work selector combines a short recommended list with the account's documented text-and-function models. Image, audio, realtime, transcription, embedding, moderation, web search, deep research, and access-restricted specialist models serve other API workflows. FigureForge still receives the provider's original catalog. A custom model ID can be entered for account-specific deployments. A third-party OpenAI-compatible endpoint retains its Chat Completions protocol.

Work sends `store: false` with Responses requests. It carries function calls, their results, and any encrypted reasoning items in the running turn so the next request can finish. A stream that loses its terminal event keeps partial text and cannot execute its proposed tools.

Model and deprecation status comes from the official catalog. The model-list endpoint reports IDs and account access. Check endpoint, streaming, function, and reasoning support on the individual model card before adding a family. [Model catalog](https://developers.openai.com/api/docs/models/all/) · [GPT-6.2 Sol](https://developers.openai.com/api/docs/models/gpt-6.2-sol/) · [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna/) · [Responses](https://developers.openai.com/api/reference/resources/responses/methods/create/) · [Deprecations](https://developers.openai.com/api/docs/deprecations/)
