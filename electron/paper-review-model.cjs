const modelConfig = require("./model-config.cjs");

/**
 * Minimal text-completion adapter for Paper review.
 *
 * The research agent talks to providers through its own tool-enabled runtime;
 * conference review only needs a single JSON answer per stage, so this module
 * keeps that path small, provider-neutral and testable without network access.
 */

const DEFAULT_MAX_TOKENS = 8_192;
const DEFAULT_TIMEOUT_MS = 300_000;
const PROVIDERS_WITH_ANTHROPIC_API = new Set(["anthropic"]);

function resolveReviewModel(settings) {
  if (settings.model.mode !== "custom") {
    const active = modelConfig.getActiveModelConfig("agent");
    if (!active.apiKey && active.provider !== "openrouter") {
      throw new Error("Configure the main agent model, or choose a custom paper-review model in Paper review settings.");
    }
    return {
      provider: active.provider,
      baseUrl: String(active.baseUrl || "").replace(/\/+$/, ""),
      model: active.model,
      apiKey: active.apiKey,
      source: "agent",
    };
  }
  const custom = settings.model;
  if (!custom.apiKey) throw new Error("Add an API key for the custom Paper review model.");
  if (!custom.model) throw new Error("Add a model name for the custom Paper review model.");
  return {
    provider: custom.provider,
    baseUrl: String(custom.baseUrl || "").replace(/\/+$/, ""),
    model: custom.model,
    apiKey: custom.apiKey,
    source: "custom",
  };
}

function sanitizeJsonText(value) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (const char of String(value || "")) {
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      output += char;
      continue;
    }
    if (inString && char.charCodeAt(0) < 0x20) {
      if (char === "\n") output += "\\n";
      else if (char === "\r") output += "\\r";
      else if (char === "\t") output += "\\t";
      else output += `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
      continue;
    }
    output += char;
  }
  // Trailing commas are a common model slip and are invalid JSON.
  return output.replace(/,\s*([}\]])/g, "$1");
}

function extractJsonObject(text) {
  const source = String(text || "").trim();
  if (!source) throw new Error("The model returned an empty response.");
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : source;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model response did not contain a JSON object.");
  const body = candidate.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    return JSON.parse(sanitizeJsonText(body));
  }
}

function isAnthropic(model) {
  return PROVIDERS_WITH_ANTHROPIC_API.has(model.provider) || /anthropic\.com/i.test(model.baseUrl);
}

function anthropicRequest(model, { system, prompt, maxTokens }) {
  return {
    url: `${model.baseUrl.replace(/\/+$/, "")}/messages`,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": model.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: {
      model: model.model,
      system,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.2,
    },
  };
}

function openAiRequest(model, { system, prompt, maxTokens }) {
  return {
    url: `${model.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${model.apiKey}`,
    },
    body: {
      model: model.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
      stream: false,
    },
  };
}

function readUsage(payload, anthropic) {
  if (anthropic) {
    return {
      inputTokens: Number(payload?.usage?.input_tokens) || 0,
      outputTokens: Number(payload?.usage?.output_tokens) || 0,
    };
  }
  return {
    inputTokens: Number(payload?.usage?.prompt_tokens) || 0,
    outputTokens: Number(payload?.usage?.completion_tokens) || 0,
  };
}

async function requestJson(model, { system, prompt, maxTokens = DEFAULT_MAX_TOKENS, signal, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch, allowTemperatureRetry = true }) {
  const anthropic = isAnthropic(model);
  const request = anthropic ? anthropicRequest(model, { system, prompt, maxTokens }) : openAiRequest(model, { system, prompt, maxTokens });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("The model request timed out.")), Math.max(5_000, timeoutMs));
  const abortIncoming = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) abortIncoming();
    else signal.addEventListener("abort", abortIncoming, { once: true });
  }
  try {
    const response = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 800);
      // Some reasoning endpoints reject temperature. Retry once without it.
      if (allowTemperatureRetry && [400, 422].includes(response.status) && /temperature|unsupported/i.test(detail)) {
        const retry = { ...request, body: { ...request.body } };
        delete retry.body.temperature;
        const retryResponse = await fetchImpl(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify(retry.body),
          signal: controller.signal,
        });
        if (retryResponse.ok) {
          const payload = await retryResponse.json();
          return { payload, usage: readUsage(payload, anthropic) };
        }
        const retryDetail = (await retryResponse.text()).slice(0, 800);
        throw new Error(`Model request failed (${retryResponse.status}): ${retryDetail}`);
      }
      throw new Error(`Model request failed (${response.status}): ${detail}`);
    }
    const payload = await response.json();
    return { payload, usage: readUsage(payload, anthropic) };
  } catch (error) {
    if (controller.signal.aborted && signal?.aborted) throw new Error("Paper review was cancelled.");
    if (error?.name === "AbortError") throw new Error("The model request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", abortIncoming);
  }
}

function textFromPayload(payload, anthropic) {
  if (anthropic) {
    const blocks = Array.isArray(payload?.content) ? payload.content : [];
    return blocks.filter((block) => block?.type === "text").map((block) => String(block.text || "")).join("\n").trim();
  }
  const message = payload?.choices?.[0]?.message;
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) return message.content.map((part) => String(part?.text || "")).join("\n").trim();
  if (typeof payload?.choices?.[0]?.text === "string") return payload.choices[0].text;
  return "";
}

async function completeJson(model, options) {
  const anthropic = isAnthropic(model);
  const first = await requestJson(model, options);
  const text = textFromPayload(first.payload, anthropic);
  try {
    return { json: extractJsonObject(text), text, usage: first.usage };
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    // One repair pass keeps a single malformed answer from wasting the whole
    // run. The repair prompt is deliberately short and schema-preserving.
    const repairPrompt = `${options.prompt}\n\nYour previous answer was not valid JSON. Return ONLY one JSON object that matches the requested schema. Do not add prose or markdown fences.`;
    const second = await requestJson(model, { ...options, prompt: repairPrompt });
    const repairedText = textFromPayload(second.payload, anthropic);
    return {
      json: extractJsonObject(repairedText),
      text: repairedText,
      usage: {
        inputTokens: first.usage.inputTokens + second.usage.inputTokens,
        outputTokens: first.usage.outputTokens + second.usage.outputTokens,
      },
    };
  }
}

function buildModelLabel(model) {
  return `${model.provider}/${model.model}`;
}

module.exports = {
  DEFAULT_MAX_TOKENS,
  resolveReviewModel,
  extractJsonObject,
  sanitizeJsonText,
  completeJson,
  requestJson,
  isAnthropic,
  textFromPayload,
  buildModelLabel,
};
