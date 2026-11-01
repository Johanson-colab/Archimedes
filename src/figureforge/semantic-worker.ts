import { AutoTokenizer, CLIPTextModelWithProjection, env } from "@huggingface/transformers";
import wasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url";
import wasmModuleUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url";

// Model weights are loaded on demand from the same upstream as the index.
// User queries are encoded locally inside this worker, never sent to the model host.
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.remoteHost = "https://qwdwqfwq.github.io/";
env.remotePathTemplate = "topconf-paper-figure-gallery/forge/models/{model}/";
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.href).href, mjs: new URL(wasmModuleUrl, self.location.href).href };
}

let load: Promise<{ tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>; model: Awaited<ReturnType<typeof CLIPTextModelWithProjection.from_pretrained>> }> | null = null;

self.onmessage = async (event: MessageEvent<{ id: number; text: string }>) => {
  const { id, text } = event.data;
  try {
    load ??= Promise.all([
      AutoTokenizer.from_pretrained("clip-vit-base-patch32"),
      CLIPTextModelWithProjection.from_pretrained("clip-vit-base-patch32", { dtype: "q8" }),
    ]).then(([tokenizer, model]) => ({ tokenizer, model }));
    const { tokenizer, model } = await load;
    const output = await model(tokenizer(text, { padding: true, truncation: true }));
    const vector = Array.from(output.text_embeds.data, Number);
    const norm = Math.hypot(...vector);
    if (vector.length !== 512 || !Number.isFinite(norm) || norm === 0) throw new Error("Invalid CLIP embedding.");
    self.postMessage({ id, vector: vector.map((value) => value / norm) });
  } catch (error) {
    load = null;
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
