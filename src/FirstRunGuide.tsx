import { useId } from "react";
import { Dialog } from "./Dialog";
import { useUISettings } from "./i18n";

const storageKey = "archimedes-first-run-guide";
export type FirstRunGuideResult = "completed" | "skipped";

export function readFirstRunGuide(storage: Pick<Storage, "getItem"> = window.localStorage): FirstRunGuideResult | null {
  const value = storage.getItem(storageKey);
  return value === "completed" || value === "skipped" ? value : null;
}

export function writeFirstRunGuide(result: FirstRunGuideResult, storage: Pick<Storage, "setItem"> = window.localStorage) {
  storage.setItem(storageKey, result);
}

const steps = [
  { id: "intro", title: "Quick guide to Archimedes", text: "Take a quick look around your research workspace. You can reopen this guide with the help button in the top bar.", action: "Start guide" },
  { id: "chat", title: "Main chat", text: "Ask research questions here. Attach files or papers to give the conversation the context it needs.", action: "Continue guide" },
  { id: "sidebar", title: "Research Apps and Projects", text: "Open tools for reading or writing in Research Apps. Use Projects below to organize your research folders and conversations.", action: "Continue guide" },
  { id: "workbench-toggle", title: "Open the Workbench", text: "Use the panel button in the top bar to show or hide the Workbench on the right.", action: "Show workbench" },
  { id: "workbench", title: "Workbench", text: "Keep files, notes, and the terminal beside your conversation. Switch tools with the tabs at the top of the panel.", action: "Continue guide" },
  { id: "aids", title: "Research aids", text: "The sparkle button opens the Proactive agent. The Research path button appears when a guided research workflow is available.", action: "Finish guide" },
] as const;

export type FirstRunGuideStep = typeof steps[number]["id"];

export default function FirstRunGuide({ step, onStep, onExit }: {
  step: FirstRunGuideStep;
  onStep: (step: FirstRunGuideStep) => void;
  onExit: (result: FirstRunGuideResult) => void;
}) {
  const { t } = useUISettings();
  const titleId = useId();
  const descriptionId = useId();
  const index = steps.findIndex(({ id }) => id === step);
  const current = steps[index];
  const next = steps[index + 1];
  const skip = () => onExit("skipped");

  return <Dialog open onClose={skip} size="sm" ariaLabelledBy={titleId} ariaDescribedBy={descriptionId}
    className="first-run-guide" overlayClassName={`app-dialog-overlay first-run-guide-overlay ${step}`}>
    <div aria-live="polite">
      <p className="first-run-guide-progress">{t("Step {step} of {total}", { step: index + 1, total: steps.length })}</p>
      <h2 id={titleId}>{t(current.title)}</h2>
      <p id={descriptionId}>{t(current.text)}</p>
    </div>
    <footer className="app-dialog-footer">
      <button type="button" className="secondary-button" onClick={skip}>{t("Skip guide")}</button>
      <button type="button" className="primary-button" onClick={() => next ? onStep(next.id) : onExit("completed")}>{t(current.action)}</button>
    </footer>
  </Dialog>;
}
