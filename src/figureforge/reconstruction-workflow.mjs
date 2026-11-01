import * as core from "./vendor/reconstruction-core.mjs";
import * as pipeline from "./vendor/reconstruction-pipeline.mjs";
import { reconstructWithEvidence } from "./vendor/bitmap-evidence.mjs";
import { materializeEditableScene } from "./vendor/materialize-scene.mjs";
import { sceneToSvgString, compareEditableRender } from "./vendor/reconstruction-renderer.mjs";

function loadImage(src) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("Could not decode reconstruction image.")); image.src = src; });
}
function taskWithoutImages(task) {
  return JSON.parse(JSON.stringify(task, (_key, value) => typeof value === "string" && /^data:image\//i.test(value) ? undefined : value));
}
async function materializeSourceCrops(nodes, source, width, height, task) {
  const images = nodes.filter((node) => node.type === "image");
  if (!images.length) return;
  if (images.length > 100 || images.reduce((total, node) => total + node.w * node.h, 0) > 80_000_000) throw new Error("Too many source image crops.");
  const image = await loadImage(source);
  for (const node of images) {
    if (![node.x, node.y, node.w, node.h].every(Number.isFinite) || node.x < 0 || node.y < 0 || node.w <= 0 || node.h <= 0 || node.x + node.w > width || node.y + node.h > height) throw new Error("Source crop is outside the image.");
    const crop = document.createElement("canvas"); crop.width = Math.max(1, Math.round(node.w)); crop.height = Math.max(1, Math.round(node.h));
    const context = crop.getContext("2d"); if (!context) throw new Error("Could not crop the source image.");
    context.drawImage(image, node.x, node.y, node.w, node.h, 0, 0, crop.width, crop.height);
    node.href = crop.toDataURL("image/png");
    node.sourceCrop = { x: node.x + (task.sourceRegion?.x || 0), y: node.y + (task.sourceRegion?.y || 0), w: node.w, h: node.h };
    node.sourceCanvas = { width: task.fullSourceWidth || width, height: task.fullSourceHeight || height };
  }
}

/** Run the upstream evidence pipeline against the host application's model transport. */
export async function reconstructWithTopConf(canvas, source, transport, onProgress = () => {}, options = {}, dependencies = {}) {
  const audit = { tiles: [] };
  const request = async (image, width, height, task) => {
    const images = [image, task.contextImage, task.retryRender, task.fullSourceImage].filter(Boolean);
    const raw = await transport({ images, width, height, task: taskWithoutImages(task) });
    if (task.sourceInventory || task.defectDiagnosis) return raw;
    if (task.regionPatch) {
      if (!Array.isArray(raw.operations) || raw.operations.length > 5000) throw new Error("Invalid repair operations.");
      const operations = [];
      for (const op of raw.operations) {
        if (!op || !["add", "update", "delete", "style", "reorder"].includes(op.op)) throw new Error("Unsupported repair operation.");
        if (op.op === "style") {
          const changes = op.changes;
          if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("Invalid repair style.");
          for (const [key, value] of Object.entries(changes)) {
            if (["fill", "stroke"].includes(key) && (typeof value !== "string" || !/^(?:#[a-f\d]{3}(?:[a-f\d]{3})?|none|transparent)$/i.test(value))) throw new Error("Invalid repair color.");
            if (["strokeWidth", "fontSize"].includes(key) && (!Number.isFinite(value) || value < 0 || value > 2000)) throw new Error("Invalid repair size.");
            if (["bold", "italic", "dash", "dashed"].includes(key) && typeof value !== "boolean") throw new Error("Invalid repair style value.");
          }
        }
        const sources = Array.isArray(op.nodes) ? op.nodes : op.node ? [op.node] : [];
        const nodes = materializeEditableScene({ nodes: sources }, width, height).nodes;
        if (["add", "update"].includes(op.op) && nodes.length !== sources.length) throw new Error("Invalid repair objects.");
        await materializeSourceCrops(nodes, image, width, height, task);
        operations.push({ ...op, node: undefined, nodes });
      }
      return { operations, uncertainties: Array.isArray(raw.uncertainties) ? raw.uncertainties : [] };
    }
    const scene = materializeEditableScene(raw, width, height);
    if (!scene.nodes.length || scene.nodes.length > 5000) throw new Error("The vision model returned no usable editable objects.");
    await materializeSourceCrops(scene.nodes, image, width, height, task);
    return scene;
  };
  const renderCrop = async (scene, region) => {
    const url = URL.createObjectURL(new Blob([sceneToSvgString(scene)], { type: "image/svg+xml" }));
    try {
      const image = await loadImage(url), crop = document.createElement("canvas"); crop.width = region.w; crop.height = region.h;
      const context = crop.getContext("2d"); if (!context) throw new Error("Could not render the reconstruction.");
      context.fillStyle = "white"; context.fillRect(0, 0, crop.width, crop.height); context.drawImage(image, region.x, region.y, region.w, region.h, 0, 0, crop.width, crop.height);
      return crop.toDataURL("image/png");
    } finally { URL.revokeObjectURL(url); }
  };
  const compactQuality = (q) => q && Object.fromEntries(Object.entries(q).filter(([, value]) => typeof value === "number" || typeof value === "boolean"));
  const api = { ...core, ...pipeline, sceneToSvgString, compactQuality, renderCrop: dependencies.renderCrop || renderCrop };
  const scene = await reconstructWithEvidence(canvas, source, request, audit, dependencies.measure || compareEditableRender, () => onProgress(audit.phase), options, api);
  return { scene, audit };
}
