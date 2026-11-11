const fs = require('node:fs');
const path = require('node:path');
const katex = require('katex');
const { workspacePath } = require('./workspace-files.cjs');
const { normalizeReport } = require('../shared/paper-deep-reading.cjs');
const TEMPLATE = path.join(__dirname, 'assets/research-skills/paper-deep-reading/templates/reading_document.html');
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function inline(value) {
  const expression = /\$(?<math>[^$]+)\$|\*\*(?<strong>[^*]+)\*\*|\*(?<em>[^*]+)\*|`(?<code>[^`]+)`|\[(?<label>[^\]]+)\]\((?<url>https?:\/\/[^\s)]+)\)/g;
  let result = '', last = 0;
  for (const match of value.matchAll(expression)) {
    const g = match.groups;
    result += esc(value.slice(last, match.index));
    result += g.math ? katex.renderToString(g.math, { output: 'mathml', throwOnError: true }) : g.strong ? `<strong>${esc(g.strong)}</strong>` : g.em ? `<em>${esc(g.em)}</em>` : g.code ? `<code>${esc(g.code)}</code>` : `<a href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">${esc(g.label)}</a>`;
    last = match.index + match[0].length;
  }
  return result + esc(value.slice(last));
}
function text(value, tag = 'span', attrs = '') {
  return `<${tag} data-zh="${esc(value.zh)}" data-en="${esc(value.en)}" ${attrs}><span lang="zh-CN">${inline(value.zh)}</span><span lang="en" hidden>${inline(value.en)}</span></${tag}>`;
}
function source(block) {
  return (block.source ? text(block.source, 'p', 'class="source"') : '') + (block.pages || []).map(p => `<button type="button" class="reading-source-page" data-source-page="${p}">PDF p. ${p}</button>`).join('');
}
function diagramSVG(diagram) {
  const visible = diagram.nodes.filter(n => n.state !== 'hidden');
  const lookup = new Map(visible.map(n => [n.id, n]));
  const coordinates = n => ({ x: n.x * 720, y: n.y * 320 });
  const edges = diagram.edges.filter(e => lookup.has(e.from) && lookup.has(e.to)).map(e => {
    const a = coordinates(lookup.get(e.from)), b = coordinates(lookup.get(e.to));
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const x = b.x - dx / length * 67, y = b.y - dy / length * 35;
    return `<line x1="${a.x}" y1="${a.y}" x2="${x}" y2="${y}" stroke="var(--accent)" stroke-width="2" ${e.kind === 'feedback' ? 'stroke-dasharray="5 4"' : ''}/><path d="M-8,-4 L0,0 L-8,4" fill="none" stroke="var(--accent)" stroke-width="2" transform="translate(${x},${y}) rotate(${Math.atan2(dy, dx) * 180 / Math.PI})"/>`;
  }).join('');
  function label(value, x, y) {
    return ['zh', 'en'].map(lang => {
      const chunks = value[lang].match(lang === 'zh' ? /.{1,9}/gu : /.{1,17}(?:\s|$)|.{1,17}/gu) || [];
      return `<text lang="${lang === 'zh' ? 'zh-CN' : 'en'}" ${lang === 'en' ? 'hidden' : ''} x="${x}" y="${y - Math.min(2, chunks.length - 1) * 7}" text-anchor="middle" fill="var(--ink)" font-size="12"><title>${esc(value[lang])}</title>${chunks.slice(0, 3).map((part, i) => `<tspan x="${x}" dy="${i ? 14 : 0}">${esc(part)}</tspan>`).join('')}</text>`;
    }).join('');
  }
  return `<svg class="reading-mechanism-graph" viewBox="0 0 720 320" role="img" aria-label="Mechanism state" data-aria-zh="机制状态图" data-aria-en="Mechanism state diagram">${edges}${visible.map(n => {
    const { x, y } = coordinates(n);
    return `<rect x="${x - 62}" y="${y - 30}" width="124" height="60" rx="${n.kind === 'state' ? 26 : 5}" fill="var(--card)" stroke="${n.state === 'active' ? 'var(--accent)' : 'var(--line)'}" stroke-width="${n.state === 'active' ? 3 : 1.5}"/>${label(n.label, x, y + 5)}`;
  }).join('')}</svg>`;
}

function processFrame(frame) {
  const names = { inputs: { zh: '输入与状态', en: 'Inputs / state' }, operations: { zh: '执行操作', en: 'Operations' }, outputs: { zh: '输出与变化', en: 'Outputs / changes' } };
  return `<div class="reading-process">${['inputs', 'operations', 'outputs'].map(key => `<div class="reading-process-lane">${text(names[key], 'h5')}${frame[key].map(v => text(v, 'div', 'class="reading-process-object"')).join('')}</div>`).join('')}</div>`;
}
function renderBlock(block, imageUrls, assets) {
  const t = block.type;
  if (t === 'paragraph' || t === 'note') return text(block.text, 'p', `class="${t}"`) + source(block);
  if (t === 'heading') return text(block.text, 'h3', `id="${block.id}" data-toc="2"`);
  if (t === 'figure') {
    const asset = assets.find(a => a.id === block.assetId), url = imageUrls.get(asset.id);
    return `<figure data-kind="figure"><button type="button" class="figure-open" data-figure-open><img loading="lazy" src="${url}" width="${asset.width}" height="${asset.height}" alt="${esc(asset.alt.zh)}" data-alt-zh="${esc(asset.alt.zh)}" data-alt-en="${esc(asset.alt.en)}"></button>${text(block.caption, 'figcaption')}${source(block)}</figure>`;
  }
  if (t === 'formula') return `<div class="formula">${katex.renderToString(block.latex, { displayMode: true, output: 'mathml', throwOnError: true })}</div>${text(block.explanation, 'p')}${source(block)}`;
  if (t === 'details') return `<details>${text(block.title, 'summary')}${text(block.text, 'p')}${source(block)}</details>`;
  if (t === 'table') return `<figure>${text(block.caption, 'figcaption')}<div class="table-scroll"><table><thead><tr>${block.headers.map(v => text(v, 'th')).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map(v => typeof v === 'number' ? `<td>${v}</td>` : text(v, 'td')).join('')}</tr>`).join('')}</tbody></table></div>${source(block)}</figure>`;
  if (t === 'comparison') {
    const max = Math.max(1, ...block.rows.map(r => r.value));
    return `<div class="comparison">${text(block.title, 'h4')}${text({ zh: `${block.unit}，${block.direction === 'higher' ? '越高越好' : '越低越好'}；横轴从零开始。`, en: `${block.unit}; ${block.direction} is better; the shared axis begins at zero.` }, 'p', 'class="source"')}${block.rows.map(r => `<div class="bar-row">${text(r.label)}<div class="bar-track"><i style="width:${r.value / max * 100}%"></i></div><b>${r.value} ${esc(block.unit)}</b></div>`).join('')}${source(block)}</div>`;
  }
  if (t === 'mechanism') {
    const actions = [['prev', '上一步', 'Previous'], ['play', '播放', 'Play'], ['next', '下一步', 'Next'], ['reset', '重播', 'Replay'], ['static', '静态全览', 'Static view']];
    return `<div class="mechanism">${text(block.title, 'h4')}${block.illustrative ? text({ zh: '教学示意，非论文实测轨迹。', en: 'Illustrative example, not an experimental trajectory.' }, 'p', 'class="source"') : ''}${block.frames.map((f, i) => `<div class="mechanism-frame" data-frame="${i}">${text(f.title, 'h4')}${diagramSVG(f.diagram)}${processFrame(f)}${text(f.text, 'p')}</div>`).join('')}<div class="mechanism-controls">${actions.map(([action, zh, en]) => text({ zh, en }, 'button', `type="button" data-action="${action}"`)).join('')}<input type="range" min="0" max="${block.frames.length - 1}" step="1" value="0" aria-label="Replay progress" data-aria-zh="回放进度" data-aria-en="Replay progress"></div>${source(block)}</div>`;
  }
  throw new Error('Unsupported reading block.');
}
function markdown(report, language = 'en') {
  const lines = [`# ${report.title[language]}`, report.subtitle[language]];
  for (const warning of report.warnings || []) lines.push(`> ${warning[language]}`);
  for (const section of report.sections) {
    lines.push(`## ${section.title[language]}`);
    for (const b of section.blocks) {
      if (b.type === 'heading') lines.push(`### ${b.text[language]}`);
      if (b.type === 'paragraph' || b.type === 'note') lines.push(b.text[language]);
      if (b.type === 'figure') { const a = report.assets.find(a => a.id === b.assetId); lines.push(`![${a.alt[language]}](assets/${path.basename(a.path)})`, b.caption[language]); }
      if (b.type === 'formula') lines.push(`$$\n${b.latex}\n$$`, b.explanation[language]);
      if (b.type === 'details') lines.push(`### ${b.title[language]}`, b.text[language]);
      if (b.type === 'table') {
        const row = cells => '| ' + cells.map(v => (typeof v === 'number' ? String(v) : v[language]).replace(/\|/g, '\\|')).join(' | ') + ' |';
        lines.push(b.caption[language], [row(b.headers), '| ' + b.headers.map(() => '---').join(' | ') + ' |', ...b.rows.map(row)].join('\n'));
      }
      if (b.type === 'comparison') lines.push(`### ${b.title[language]}`, ...b.rows.map(r => `- ${r.label[language]}: ${r.value} ${b.unit}`));
      if (b.type === 'mechanism') lines.push(`### ${b.title[language]}`, ...b.frames.map((f, i) => `${i + 1}. **${f.title[language]}**: ${f.text[language]}\n\n${['inputs', 'operations', 'outputs'].map(k => f[k].map(v => v[language]).join('; ')).join(' → ')}`));
      if (b.source) lines.push(b.source[language]);
      if (b.pages?.length) lines.push(language === 'zh' ? `原文 PDF 页码：${b.pages.join('、')}。` : `Source PDF pages: ${b.pages.join(', ')}.`);
    }
  }
  return lines.join('\n\n') + '\n';
}
function renderReport(input, workspace, { sourceButtons = false } = {}) {
  const report = normalizeReport(input), imageUrls = new Map(); let bytes = 0;
  for (const asset of report.assets) {
    const data = fs.readFileSync(workspacePath(workspace, asset.path)); bytes += data.length;
    if (bytes > 24 * 1024 * 1024) throw new Error('The extracted figure bundle is too large. Use fewer or smaller figure crops.');
    imageUrls.set(asset.id, `data:image/jpeg;base64,${data.toString('base64')}`);
  }
  const body = report.sections.map(s => `<section id="${s.id}" data-section>${text(s.title, 'h2', 'data-toc="1"')}${s.blocks.map(b => renderBlock(b, imageUrls, report.assets)).join('')}</section>`).join('');
  const nav = report.sections.map(s => text(s.title, 'a', `href="#${s.id}"`)).join('');
  let html = fs.readFileSync(TEMPLATE, 'utf8').replace('@@TITLE@@', esc(report.title.zh)).replace('@@NAV@@', nav).replace('@@HERO@@', text(report.title, 'h1') + text(report.subtitle, 'p', 'class="subtitle"') + report.warnings.map(w => text(w, 'p', 'class="note"')).join('')).replace('@@BODY@@', body);
  const css = `.note{background:color-mix(in srgb,var(--accent) 8%,var(--card))}.comparison,.mechanism{background:var(--paper);border-color:var(--line)}.sidebar a.active{background:color-mix(in srgb,var(--accent) 10%,var(--paper))}th{background:var(--paper)}.reading-process{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}.reading-process-lane{min-width:0}.reading-process h5{margin:5px 0 12px;color:var(--muted)}.reading-process-object{padding:12px;margin:8px 0;background:var(--card);border:1px solid var(--line);border-radius:6px;overflow-wrap:anywhere}.reading-process-lane:nth-child(2){border-inline:1px dashed var(--accent);padding-inline:12px}.reading-source-page{font-size:11px;min-height:22px;margin:0 6px 2px 0;padding:0 3px;background:transparent;border:0;color:var(--accent);text-decoration:underline;text-underline-offset:3px}@media(max-width:650px){.reading-process{grid-template-columns:1fr}.reading-process-lane:nth-child(2){border-inline:0;border-block:1px dashed var(--accent);padding:12px 0}}`;
  html = html.replace('</style>', css + '</style>');
  if (!sourceButtons) html = html.replace(/<button[^>]*data-source-page="(\d+)"[^>]*>[\s\S]*?<\/button>/g, '<span class="source reading-source-citation">PDF p. $1</span> ');
  else {
    html = html.replace('</style>', '.topbar{display:contents}.topbar .brand,.topbar #language{display:none}html{scroll-padding-top:24px}.sidebar{top:24px;height:calc(100vh - 48px)}@media(max-width:650px){.sidebar{height:auto}.topbar .menu-toggle{position:fixed;top:8px;right:12px;z-index:10}}' + '</style>');
    html = html.replace('</body>', `<script>document.querySelectorAll('[data-source-page]').forEach(b=>b.onclick=()=>parent.postMessage({type:'paper-deep-reading:source',page:Number(b.dataset.sourcePage)},'*'));window.addEventListener('message',e=>{if(e.source!==parent||e.data?.type!=='paper-deep-reading:theme')return;for(const [key,value] of Object.entries(e.data.colors||{})){if(['paper','card','ink','muted','accent','line','warm'].includes(key)&&typeof value==='string'&&CSS.supports('color',value))document.documentElement.style.setProperty('--'+key,value);}});parent.postMessage({type:'paper-deep-reading:ready'},'*');</script></body>`);
  }
  return html;
}
module.exports = { renderReport, markdown, renderBlock, diagramSVG };
