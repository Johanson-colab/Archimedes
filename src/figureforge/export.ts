import { buildNativePptx } from "./vendor/editable-native.mjs";
import { sceneToDrawio, sceneToVsdxFiles, zipStore } from "./vendor/upstream-exporters.mjs";
import template from "./vendor/pptx-template.json";
import type { FigureScene } from "./reconstruction.mjs";
import { sceneToSvgString } from "./vendor/reconstruction-renderer.mjs";

export async function exportFigureScene(scene: FigureScene, format: "svg" | "pptx" | "vsdx" | "drawio", font: string): Promise<Blob> {
  const styledScene = { ...scene, nodes: scene.nodes.map((node) => node.type === "text" && font ? { ...node, fontFamily: font } : node) };
  if (format === "svg") return new Blob([sceneToSvgString(styledScene)], { type: "image/svg+xml" });
  if (format === "drawio") return new Blob([sceneToDrawio(styledScene)], { type: "application/xml" });
  if (format === "pptx") return buildNativePptx(styledScene, zipStore, template);
  return zipStore(sceneToVsdxFiles(styledScene, font));
}
