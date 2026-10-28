export type ResearchStageId = "conversation" | "ideas" | "experiments" | "writing" | "review";

export type ResearchStage = {
  id: ResearchStageId;
  label: string;
  mode: ResearchMode;
  checkpoint: string;
  description: string;
};

export const researchStages: ResearchStage[] = [
  {
    id: "conversation",
    label: "Conversation",
    mode: "free-chat",
    checkpoint: "Problem framing",
    description: "Define the question, constraints, and what would count as evidence.",
  },
  {
    id: "ideas",
    label: "Ideas",
    mode: "idea-spark",
    checkpoint: "Hypothesis set",
    description: "Turn the question into competing, testable hypotheses.",
  },
  {
    id: "experiments",
    label: "Experiments",
    mode: "experiment-setup",
    checkpoint: "Experiment plan",
    description: "Specify the method, baselines, metrics, and failure conditions.",
  },
  {
    id: "writing",
    label: "Writing",
    mode: "paper-generation",
    checkpoint: "Draft evidence",
    description: "Write the argument with citations and reproducible artifacts.",
  },
  {
    id: "review",
    label: "Review",
    mode: "paper-review",
    checkpoint: "Review memo",
    description: "Audit claims, limitations, and the evidence behind each conclusion.",
  },
];

export function stageForMode(mode: ResearchMode): ResearchStage {
  return researchStages.find((stage) => stage.mode === mode) ?? researchStages[0];
}
