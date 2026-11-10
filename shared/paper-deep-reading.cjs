const SECTION_IDS = ['overview', 'related-work', 'method', 'experiments', 'limitations', 'discussion', 'references'];
const BLOCK_TYPES = new Set(['paragraph', 'heading', 'note', 'figure', 'table', 'formula', 'details', 'comparison', 'mechanism']);
function text(value, name = 'text', limit = 30000) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`Invalid ${name}: expected nonempty text up to ${limit} characters.`);
  return value.trim();
}
function bilingual(value, name = 'text') { return { zh: text(value?.zh, `${name}.zh`), en: text(value?.en, `${name}.en`) }; }
function pages(value, count) {
  if (!Array.isArray(value) || !value.length || value.length > 40 || value.some(p => !Number.isInteger(p) || p < 1 || p > count)) throw new Error('Evidence pages must refer to the original PDF.');
  return [...new Set(value)];
}
function normalizeBlock(block, { pageCount, assets = [], prefix = 'section', index = 0 }) {
  if (!block || !BLOCK_TYPES.has(block.type)) throw new Error('Unsupported reading block.');
  const type = block.type;
  const result = { type };
  if (block.pages) result.pages = pages(block.pages, pageCount);
  if (block.source) result.source = bilingual(block.source, 'source');
  if (['paragraph', 'note'].includes(type)) result.text = bilingual(block.text);
  if (type === 'heading') { result.id = `${prefix}-heading-${index}`; result.text = bilingual(block.text); }
  if (type === 'figure') {
    const asset = assets.find(a => a.id === block.assetId);
    if (!asset) throw new Error('The report referenced a figure that was not extracted.');
    result.assetId = asset.id; result.caption = bilingual(block.caption, 'caption');
    result.pages = [asset.page]; result.source = asset.source;
  }
  if (type === 'formula') { result.latex = text(block.latex, 'latex', 8000); result.explanation = bilingual(block.explanation); }
  if (type === 'details') { result.title = bilingual(block.title); result.text = bilingual(block.text); }
  if (type === 'table') {
    result.caption = bilingual(block.caption); result.headers = (block.headers || []).map(v => bilingual(v));
    if (!result.headers.length || result.headers.length > 15 || !Array.isArray(block.rows) || !block.rows.length || block.rows.length > 100) throw new Error('Invalid evidence table.');
    result.rows = block.rows.map(row => {
      if (!Array.isArray(row) || row.length !== result.headers.length) throw new Error('Table row widths must match the headers.');
      return row.map(v => typeof v === 'number' && Number.isFinite(v) ? v : bilingual(v));
    });
  }
  if (type === 'comparison') {
    result.title = bilingual(block.title); result.unit = text(block.unit, 'unit', 60);
    if (!Array.isArray(block.rows) || !block.rows.length || block.rows.length > 30) throw new Error('Invalid comparison.');
    result.rows = block.rows.map(row => {
      if (!Number.isFinite(row.value) || row.value < 0) throw new Error('Comparison values must be nonnegative reported values.');
      return { label: bilingual(row.label), value: row.value };
    });
    result.direction = block.direction === 'higher' ? 'higher' : 'lower';
  }
  if (type === 'mechanism') {
    result.title = bilingual(block.title); result.illustrative = block.illustrative === true;
    if (!Array.isArray(block.frames) || block.frames.length < 2 || block.frames.length > 12) throw new Error('Mechanism requires 2–12 meaningful process states.');
    result.frames = block.frames.map(frame => {
      const state = { title: bilingual(frame.title), text: bilingual(frame.text) };
      for (const key of ['inputs', 'operations', 'outputs']) {
        if (!Array.isArray(frame[key]) || !frame[key].length || frame[key].length > 5) throw new Error('Mechanism states must explain inputs, operations and outputs.');
        state[key] = frame[key].map(v => bilingual(v));
      }
      const diagram = frame.diagram;
      if (!diagram || !Array.isArray(diagram.nodes) || diagram.nodes.length < 2 || diagram.nodes.length > 24 || !Array.isArray(diagram.edges) || diagram.edges.length > 40) throw new Error('Mechanism states require a structured object/relationship diagram.');
      const ids = new Set();
      state.diagram = { nodes: diagram.nodes.map(node => {
        if (!/^[a-zA-Z][a-zA-Z0-9-]{0,40}$/.test(node.id) || ids.has(node.id) || ![node.x, node.y].every(Number.isFinite) || node.x < .1 || node.x > .9 || node.y < .12 || node.y > .88) throw new Error('Invalid mechanism object identity or position.');
        ids.add(node.id);
        return { id: node.id, label: bilingual(node.label), x: node.x, y: node.y, kind: node.kind === 'state' ? 'state' : 'artifact', state: ['active', 'revealed', 'hidden'].includes(node.state) ? node.state : 'revealed' };
      }), edges: diagram.edges.map(edge => {
        if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error('Mechanism edges must reference actual objects.');
        return { from: edge.from, to: edge.to, kind: edge.kind === 'feedback' ? 'feedback' : 'forward' };
      }) };
      return state;
    });
    const signatures = result.frames.map(f => JSON.stringify({ nodes: f.diagram.nodes.filter(n => n.state !== 'hidden').map(({ id, x, y }) => ({ id, x, y })), edges: f.diagram.edges }));
    if (new Set(signatures).size < 2) throw new Error('Mechanism frames must reveal/move objects or change relationships, not only change text or colors.');
  }
  if (['table', 'comparison', 'mechanism'].includes(type) && (!result.source || !result.pages)) throw new Error('Visual evidence must include a bilingual source and valid PDF pages.');
  return result;
}
function normalizeSection(section, context) {
  if (!SECTION_IDS.includes(section?.id) || !Array.isArray(section.blocks) || !section.blocks.length || section.blocks.length > 100) throw new Error('Invalid deep-reading section.');
  const blocks = section.blocks.map((b, index) => normalizeBlock(b, { ...context, prefix: section.id, index }));
  const prose = blocks.filter(b => b.type === 'paragraph');
  if (!prose.length) throw new Error('Each section needs readable analysis beyond captions or headings.');
  if (['related-work', 'method', 'experiments', 'limitations'].includes(section.id) && (prose.length < 2 || prose.some(b => !b.pages?.length))) throw new Error('Each core chapter needs multiple explanatory paragraphs with PDF-page evidence.');
  return { id: section.id, title: bilingual(section.title), blocks };
}
function normalizeReport(report) {
  if (report?.skill?.id !== 'paper-deep-reading' || report.version !== 1) throw new Error('Unsupported deep-reading report version.');
  if (!Number.isInteger(report.pageCount) || report.pageCount < 1 || report.pageCount > 600) throw new Error('Invalid source page count.');
  if (!Array.isArray(report.sections) || report.sections.map(s => s.id).join(',') !== SECTION_IDS.join(',')) throw new Error('The report must contain the seven reading chapters in order.');
  const assets = (report.assets || []).map(a => {
    if (!/^figure-[a-z0-9-]+$/.test(a.id) || !/^\.archimedes\/paper-deep-reading\/[a-f0-9-]+\/assets\/[a-z0-9-]+\.jpg$/.test(a.path)) throw new Error('Invalid original-figure reference.');
    const crop = a.crop;
    if (!crop || ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1.001 || crop.y + crop.height > 1.001) throw new Error('Invalid figure crop.');
    if (![a.width, a.height].every(v => Number.isInteger(v) && v > 0 && v <= 6000)) throw new Error('Invalid figure dimensions.');
    return { id: a.id, path: a.path, width: a.width, height: a.height, page: pages([a.page], report.pageCount)[0], label: text(a.label, 'label', 500), alt: bilingual(a.alt), source: bilingual(a.source), crop: a.crop };
  });
  if (assets.length > 24 || new Set(assets.map(a => a.id)).size !== assets.length) throw new Error('Invalid figure inventory.');
  return {
    version: 1, skill: { id: 'paper-deep-reading', name: 'Paper deep reading' },
    title: bilingual(report.title), subtitle: bilingual(report.subtitle), pageCount: report.pageCount,
    sourceDigest: text(report.sourceDigest, 'source digest', 100), assets,
    sections: report.sections.map(s => normalizeSection(s, { pageCount: report.pageCount, assets })),
    warnings: Array.isArray(report.warnings) ? report.warnings.slice(0, 40).map(v => bilingual(v)) : [],
    assetReview: Array.isArray(report.assetReview) ? report.assetReview.slice(0, 150).map(a => ({ id: text(a.id, 'candidate ID', 100), decision: a.decision === 'use' ? 'use' : 'omit', reason: bilingual(a.reason) })) : [],
  };
}
module.exports = { SECTION_IDS, bilingual, pages, normalizeBlock, normalizeSection, normalizeReport };
