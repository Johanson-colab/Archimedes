import { useMemo, useState } from "react";
import { Button, Field, Panel, StateView, Tab, Tabs } from "./archimedes/components";
import { appFetch, useHostContext } from "./archimedes/sdk";

// This is an honest starter, not a completed scientific workflow. Replace it and its acceptance plan.
const appName = "__APP_NAME__";
const python = false;
const layout = "canvas";
export default function App() {
  const host = useHostContext();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("canvas");
  const words = useMemo(() => output.split(/\s+/).filter(Boolean), [output]);
  const frequency = useMemo(() => [...new Set(words)].map(word => ({ word, count: words.filter(value => value === word).length })).sort((a, b) => b.count - a.count).slice(0, 8), [words]);
  async function run(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = python ? (await appFetch<{ output: string }>("/api/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: input.trim() }) })).output : input.trim();
      setOutput(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  return <main className={`app-root layout-${layout}`}>
    <header className="workspace-heading"><div><p className="app-kicker">RESEARCH APPS <span>/ DRAFT WORKSPACE</span></p><h1>{appName}</h1></div><span className="workspace-status">Working draft<i />{host.theme === "paper" ? "Paper" : "Charcoal"}</span></header>
    <div className="workspace-intro"><p>A place to turn a question into something you can work with.</p><span>Starter example · replace with your research workflow</span></div>
    <div className="workspace-body">
      <aside className="input-rail"><p className="app-kicker">01 / MATERIAL</p><form id="task" onSubmit={run}>
        <Field label="Working text" htmlFor="input" hint="Paste a short passage to explore this starter."><textarea id="input" required value={input} onChange={event => setInput(event.target.value)} placeholder="Start with a question, an observation, or a passage…" /></Field>
        <Button disabled={busy}>{busy ? "Processing…" : "Run example"}<span aria-hidden>↗</span></Button>
      </form><div className="starter-notes"><p>Try a starting point</p>{["Evidence makes research questions testable.", "Compare methods. Trace evidence. Refine questions."].map(text => <button type="button" key={text} onClick={() => setInput(text)}>{text}<span>↗</span></button>)}</div></aside>
      <section className="working-area" aria-label="Working area"><Tabs value={tab} onChange={setTab} label="Workspace views"><Tab value="canvas">Explore</Tab><Tab value="text">Source text</Tab></Tabs>
        {error && <StateView tone="error" title="The request could not finish" description={error} />}
        {tab === "canvas" ? <div className="canvas-content"><div className="canvas-heading"><div><p className="app-kicker">02 / OBSERVATIONS</p><h2>Let the material lead.</h2></div><span className="count-note">{words.length.toString().padStart(2, "0")} <small>words processed</small></span></div>
          {frequency.length ? <div className="word-plot" aria-label="Word frequency">{frequency.map(({ word, count }, index) => <div key={word}><span>{word}</span><i style={{ width: `${Math.max(8, count / words.length * 100)}%`, background: `var(--analysis-series-${index % 6 + 1})` }} /><b>{count}</b></div>)}</div> : <div className="canvas-empty"><div className="line-study" aria-hidden>{[36, 67, 45, 84, 60, 48, 76, 40].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><p>Your material, in perspective.</p><small>Run the example to see a frequency view of your text.</small></div>}
          <Panel className="result-strip" label="Example output"><span className="app-kicker">OUTPUT</span><output id="output" aria-live="polite">{output || "Ready"}</output></Panel>
        </div> : <Panel label="Submitted text"><h2>Source text</h2><p className="source-copy">{output || "No text processed yet."}</p></Panel>}
      </section>
    </div><footer className="workspace-footer"><span>LOCAL WORKSPACE</span><span>Inspect the source. Shape the workflow. Keep the evidence.</span></footer>
  </main>;
}
