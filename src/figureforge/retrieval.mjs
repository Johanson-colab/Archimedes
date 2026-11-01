import { buildIndex, prepareQuery, rank } from "./vendor/retrieval.mjs";

const DEFAULT_ROOT = "https://qwdwqfwq.github.io/topconf-paper-figure-gallery/forge/data/";
const DIMENSIONS = 512;

/** Load a coherent Top-Conf index; images remain remote and are not downloaded. */
export async function loadRetrievalIndex({ fetchImpl = fetch, root = DEFAULT_ROOT, signal } = {}) {
  async function read(name, binary = false, version = "") {
    const url = new URL(name, root);
    if (version) url.searchParams.set("v", version);
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error(`Figure index ${name} timed out.`)), binary ? 120_000 : 30_000);
    try {
      const response = await fetchImpl(url.href, { signal: controller.signal });
      if (!response.ok) throw new Error(`Figure index ${name}: HTTP ${response.status}`);
      return await (binary ? response.arrayBuffer() : response.json());
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  const manifest = await read("manifest.json");
  const version = String(manifest?.dataVersion || "");
  const [figs, ids, bm] = await Promise.all(["figures.json", "ids.json", "bm25.json"].map((name) => read(name, false, version)));
  if (!Array.isArray(figs) || !Array.isArray(ids) || !Array.isArray(bm?.docs)) throw new Error("Invalid FigureForge index format.");
  const data = { figs, ids, bm, IE: null, TE: null };
  const index = buildIndex(data);
  return { data, index, version, async loadEmbeddings() {
    const [images, texts] = await Promise.all(["image_emb.bin", "text_emb.bin"].map((name) => read(name, true, version)));
    if (images.byteLength !== ids.length * DIMENSIONS * 4 || texts.byteLength !== ids.length * DIMENSIONS * 4) throw new Error("FigureForge embedding dimensions do not match the index.");
    data.IE = new Float32Array(images); data.TE = new Float32Array(texts);
  } };
}

export function searchRetrievalIndex({ data, index }, query, candidates, vector = null) {
  const indices = candidates ?? data.figs.map((_, i) => i);
  if (!query.trim()) return indices.map((i) => ({ figure: data.figs[i], score: null }));
  const imageScores = new Float32Array(data.ids.length);
  const textScores = new Float32Array(data.ids.length);
  if (vector != null) {
    if (vector.length !== DIMENSIONS || !data.IE || !data.TE || Array.from(vector).some((x) => !Number.isFinite(x))) throw new Error("Semantic search is not ready or returned an invalid vector.");
    for (const i of indices) for (let j = 0; j < DIMENSIONS; j++) {
      imageScores[i] += data.IE[i * DIMENSIONS + j] * vector[j];
      textScores[i] += data.TE[i * DIMENSIONS + j] * vector[j];
    }
  }
  return rank(index, prepareQuery(query, index.idf), indices, imageScores, textScores)
    .map((item) => ({ figure: data.figs[item.i], score: item.score, reason: item.reason, keywords: Array.isArray(item.hits) ? item.hits.slice(0, 4) : [] }));
}

export function prepareSemanticQuery({ index }, query) {
  return prepareQuery(query, index.idf).clipText;
}
