import { inventoryPrompt, nativeLayoutRecognitionPrompt, regionalScenePrompt, patchPrompt, evidencePrompt, localInspectionPrompt, typographyTolerance } from "./vendor/bitmap-evidence.mjs";
import { editableScenePrompt } from "./vendor/reconstruction-prompt.mjs";

// Source-image data must travel as images, not be duplicated into the catalog.
export function serializeVisionCatalog(value) {
  return JSON.stringify(value, (key, item) => key === "href" && typeof item === "string" ? "SOURCE_IMAGE_CROP" : item);
}

/** Build the same role-specific requests used by the upstream evidence pipeline. */
export function reconstructionPrompt(width, height, task) {
  if (task.sourceInventory) return inventoryPrompt(width, height) + (task.resourceCoordinateConfirmation ? ` Reinspect all coordinates and provide a complete corrected inventory. Previous inventory: ${serializeVisionCatalog(task.previousInventory)}` : "");
  if (task.regionPatch) return patchPrompt(width, height, task, serializeVisionCatalog);
  if (task.defectDiagnosis) {
    const context = task.localInspection ? localInspectionPrompt(task) : task.wholeImageAssessment ? evidencePrompt(task.sourceChecklist) : "";
    return `${context}\nCompare image 1 (original) with image 2 (editable rendering). Return strict JSON containing complete, defects, uncertainties and, for whole-image assessment, wholeImageAcceptable, summary, coverage, inventoryComplete, unlistedSourceItems and an evidence row for every inventory item. Do not invent content. Coordinates are ${task.localInspection ? "crop-relative" : "global"} pixels, canvas ${width} x ${height}. ${typographyTolerance}\nEditable catalog: ${serializeVisionCatalog(task.catalog)}`;
  }
  if (task.regionalRecognition) return regionalScenePrompt(width, height, task);
  if (task.nativeLayout) return nativeLayoutRecognitionPrompt(width, height, task.sourceChecklist, task.nativeRegions);
  return editableScenePrompt(width, height, "");
}
