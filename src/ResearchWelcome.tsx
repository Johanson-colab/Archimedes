import { ArrowUpRight } from "lucide-react";

export type ResearchWelcomeAction = "idea" | "literature" | "replication" | "illustration";

const workflows: Array<{
  id: ResearchWelcomeAction;
  title: string;
  description: string;
  image: string;
}> = [
  {
    id: "idea",
    title: "Discover ideas",
    description: "Find a research question in evidence, contradictions, and open gaps.",
    image: "/welcome/idea-discovery.jpg",
  },
  {
    id: "literature",
    title: "Research literature",
    description: "Search papers, trace citations, and verify the evidence at the source.",
    image: "/welcome/literature-research.jpg",
  },
  {
    id: "replication",
    title: "Reproduce a paper",
    description: "Set up a faithful baseline.",
    image: "/welcome/paper-replication.jpg",
  },
  {
    id: "illustration",
    title: "Generate figures",
    description: "Prepare figures with visual rigor.",
    image: "/welcome/illustration-generation.jpg",
  },
];

export default function ResearchWelcome({ onSelect }: { onSelect: (action: ResearchWelcomeAction) => void }) {
  return <section className="research-welcome" aria-label="Start a research workflow">
    <div className="research-welcome-hero">
      <img src="/welcome/archimedes-hero.jpg" alt="Archimedes in a classical study surrounded by geometric instruments" />
      <div className="research-welcome-copy">
        <h1>Choose your path</h1>
        <blockquote>Turn curiosity into questions worth testing, and evidence into answers worth trusting.</blockquote>
      </div>
    </div>

    <div className="research-workflow-board">
      {workflows.map((workflow) => <button key={workflow.id} type="button" className={`research-workflow research-workflow-${workflow.id}`} onClick={() => onSelect(workflow.id)}>
        <span className="research-workflow-image"><img src={workflow.image} alt="" /></span>
        <span className="research-workflow-copy">
          <strong>{workflow.title}</strong>
          <span>{workflow.description}</span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </span>
      </button>)}
    </div>
  </section>;
}
