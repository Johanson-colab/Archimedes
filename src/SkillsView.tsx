import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  BrainCircuit,
  Check,
  ChevronRight,
  LibraryBig,
  LoaderCircle,
  Microscope,
  PenTool,
  Plus,
  Presentation,
  Search,
  Workflow,
} from "lucide-react";

const collectionAppearance: Record<string, { icon: React.ReactNode; tone: string }> = {
  "AI-Research-SKILLs": { icon: <BrainCircuit size={22} />, tone: "green" },
  "Research-Paper-Writing-Skills": { icon: <PenTool size={22} />, tone: "gold" },
  "academic-research-skills": { icon: <LibraryBig size={22} />, tone: "blue" },
  "nature-skills": { icon: <Microscope size={22} />, tone: "teal" },
  "paper-craft-skills": { icon: <Presentation size={22} />, tone: "coral" },
  ARIS: { icon: <Workflow size={22} />, tone: "graphite" },
};

function collectionIcon(collectionId: string, size = 22) {
  const appearance = collectionAppearance[collectionId];
  if (!appearance) return <BrainCircuit size={size} />;
  return <span className="skill-icon-resize" style={{ "--skill-icon-size": `${size}px` } as React.CSSProperties}>{appearance.icon}</span>;
}

function markdownBody(content: string) {
  return content.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/, "");
}

export default function SkillsView({ bridge, workspace, attachedIds, onAttach }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  attachedIds: Set<string>;
  onAttach: (item: ContextAttachment) => void;
}) {
  const [collections, setCollections] = useState<SkillCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<SkillCollection | null>(null);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillDetail | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    bridge.listSkillCollections(workspace).then((items) => {
      if (active) setCollections(items);
    }).catch((reason) => {
      if (active) setError(String(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [bridge, workspace]);

  async function openCollection(collection: SkillCollection) {
    setSelectedCollection(collection);
    setSelectedSkill(null);
    setSkills([]);
    setQuery("");
    setError("");
    setLoading(true);
    try {
      const items = await bridge.listSkills(workspace, collection.id);
      setSkills(items);
      if (items[0]) await openSkill(items[0]);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }

  async function openSkill(skill: SkillSummary) {
    setError("");
    try {
      setSelectedSkill(await bridge.readSkill(workspace, skill.id));
    } catch (reason) {
      setError(String(reason));
    }
  }

  function attachSkill(skill: SkillDetail) {
    onAttach({
      id: `skill:${skill.path}`,
      type: "skill",
      name: skill.name,
      path: skill.path,
      detail: `${skill.collectionName} · ${skill.category}`,
    });
  }

  const filteredSkills = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return skills;
    return skills.filter((skill) => {
      const searchable = `${skill.name} ${skill.description} ${skill.category}`.toLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  }, [query, skills]);
  const groupedSkills = useMemo(() => {
    const groups = new Map<string, SkillSummary[]>();
    for (const skill of filteredSkills) groups.set(skill.category, [...(groups.get(skill.category) || []), skill]);
    return [...groups.entries()];
  }, [filteredSkills]);

  if (!selectedCollection) {
    return <section className="skills-page">
      <header className="skills-page-header">
        <div><span className="page-kicker">Capabilities</span><h1>Skills</h1><p>Browse reusable research instructions and attach the ones you need to an Archimedes conversation.</p></div>
        <span className="skills-total"><strong>{collections.reduce((total, collection) => total + collection.skillCount, 0)}</strong> indexed skills</span>
      </header>
      {loading && <div className="skills-state"><LoaderCircle className="spin" size={18} />Indexing local skills...</div>}
      {!loading && <div className="skill-collection-grid">
        {collections.map((collection) => {
          const appearance = collectionAppearance[collection.id] || { icon: <BrainCircuit size={22} />, tone: "green" };
          return <button key={collection.id} className="skill-collection-card" onClick={() => void openCollection(collection)}>
            <span className={`skill-collection-icon ${appearance.tone}`}>{appearance.icon}</span>
            <span className="skill-collection-copy"><strong>{collection.name}</strong><small>{collection.description}</small></span>
            <span className="skill-collection-count">{collection.skillCount} skills</span>
            <ChevronRight size={15} />
          </button>;
        })}
      </div>}
      {error && <div className="skills-error">{error.replace(/^Error:\s*/, "")}</div>}
    </section>;
  }

  const appearance = collectionAppearance[selectedCollection.id] || { icon: <BrainCircuit size={22} />, tone: "green" };
  return <section className="skills-page skills-detail-page">
    <header className="skills-detail-header">
      <button className="skills-back" onClick={() => { setSelectedCollection(null); setSelectedSkill(null); setError(""); }} title="Back to skill collections"><ArrowLeft size={16} /></button>
      <span className={`skill-collection-icon ${appearance.tone}`}>{appearance.icon}</span>
      <div><span className="page-kicker">Skill collection</span><h1>{selectedCollection.name}</h1><p>{selectedCollection.description}</p></div>
      <span className="skills-total"><strong>{skills.length}</strong> skills</span>
    </header>

    <div className="skills-explorer">
      <aside className="skills-index">
        <label className="skills-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this collection" /></label>
        <div className="skills-index-scroll">
          {groupedSkills.map(([category, items]) => <section className="skill-category" key={category}>
            <h2>{category}</h2>
            {items.map((skill) => <button key={skill.id} className={selectedSkill?.id === skill.id ? "skill-index-row active" : "skill-index-row"} onClick={() => void openSkill(skill)}>
              <span className="skill-index-icon">{collectionIcon(skill.collectionId, 14)}</span>
              <span><strong>{skill.name}</strong><small>{skill.description || "Reusable research instructions"}</small></span>
            </button>)}
          </section>)}
          {!loading && !filteredSkills.length && <div className="skills-state compact">No matching skills.</div>}
        </div>
      </aside>

      <div className="skill-preview-pane">
        {loading && !selectedSkill && <div className="skills-state"><LoaderCircle className="spin" size={18} />Loading collection...</div>}
        {!loading && !selectedSkill && <div className="skills-state">This collection does not contain any `SKILL.md` files yet.</div>}
        {selectedSkill && <>
          <header className="skill-preview-header">
            <span className={`skill-collection-icon ${appearance.tone}`}>{collectionIcon(selectedSkill.collectionId, 19)}</span>
            <div><span>{selectedSkill.category}</span><h2>{selectedSkill.name}</h2><p>{selectedSkill.description}</p></div>
            <button className={attachedIds.has(`skill:${selectedSkill.path}`) ? "secondary-button skill-added" : "primary-button"} onClick={() => attachSkill(selectedSkill)} disabled={attachedIds.has(`skill:${selectedSkill.path}`)}>
              {attachedIds.has(`skill:${selectedSkill.path}`) ? <Check size={14} /> : <Plus size={14} />}
              {attachedIds.has(`skill:${selectedSkill.path}`) ? "Added to chat" : "Add to chat"}
            </button>
          </header>
          <article className="skill-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownBody(selectedSkill.content)}</ReactMarkdown></article>
        </>}
        {error && <div className="skills-error">{error.replace(/^Error:\s*/, "")}</div>}
      </div>
    </div>
  </section>;
}
