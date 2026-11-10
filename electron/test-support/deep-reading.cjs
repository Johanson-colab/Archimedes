const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createCanvas } = require('@napi-rs/canvas');
const { SECTION_IDS } = require('../../shared/paper-deep-reading.cjs');
const bi = (zh, en = zh) => ({ zh, en });
function samplePdf() {
  const stream = 'BT /F1 14 Tf 30 265 Td (A controlled example) Tj 0 -170 Td (Figure 1 | Recorded process) Tj 0 -30 Td (The measured score is 12.) Tj ET\n40 120 220 110 re S\n';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`];
  let data = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(data)); data += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(data); data += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) data += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return Buffer.from(`${data}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
function report(workspace) {
  const run = randomUUID(), relative = `.archimedes/paper-deep-reading/${run}/assets/figure-example.jpg`;
  const filename = path.join(workspace, relative); fs.mkdirSync(path.dirname(filename), { recursive: true });
  const canvas = createCanvas(640, 200), c = canvas.getContext('2d'); c.fillStyle = 'white'; c.fillRect(0, 0, 640, 200); c.fillStyle = '#186b64'; c.fillRect(30, 60, 160, 80); c.fillRect(450, 60, 160, 80); c.fillStyle = 'black'; c.font = '20px Arial'; c.fillText('Input', 75, 110); c.fillText('Output', 490, 110); c.fillRect(200, 97, 235, 5); fs.writeFileSync(filename, canvas.toBuffer('image/jpeg'));
  const source = bi('原文第1页，图1。', 'Paper p. 1, Figure 1.');
  const sections = SECTION_IDS.map(id => ({ id, title: bi(id), blocks: [
    { type: 'heading', text: bi('证据与判断', 'Evidence and assessment') },
    { type: 'paragraph', text: bi('该受控示例报告分数为12；这个数值仅用于测试数据链路。', 'The controlled fixture reports a score of 12; this value tests the evidence data path.'), pages: [1] },
    { type: 'paragraph', text: bi('一次观测没有提供随机种子方差，因此不能推断统计显著性。', 'One observation supplies no seed variance and cannot establish statistical significance.'), pages: [1] },
  ] }));
  sections.find(s => s.id === 'method').blocks.push({ type: 'figure', assetId: 'figure-example', caption: bi('图1：受控流程示例。', 'Figure 1: controlled process example.') }, { type: 'formula', latex: 'V=\\max_{v\\in T}s_v-\\beta N', explanation: bi('分数与尝试代价。', 'Score and attempt cost.'), pages: [1] }, { type: 'mechanism', title: bi('过程演示', 'Process demonstration'), source, pages: [1], illustrative: true, frames: [
    { title: bi('读取输入', 'Read input'), text: bi('起初只能观察输入。', 'Initially only the input is observed.'), inputs: [bi('输入', 'Input')], operations: [bi('读取', 'Read')], outputs: [bi('已知状态', 'Known state')] },
    { title: bi('生成输出', 'Produce output'), text: bi('根据输入执行处理后得到输出。', 'Processing the input produces an output.'), inputs: [bi('已知状态', 'Known state')], operations: [bi('处理', 'Process')], outputs: [bi('结果', 'Result')] },
  ] });
  sections.find(s => s.id === 'experiments').blocks.push({ type: 'comparison', title: bi('数值对照', 'Measured comparison'), unit: 'ms', direction: 'lower', rows: [{ label: bi('对照', 'Control'), value: 12 }, { label: bi('候选', 'Candidate'), value: 10 }], source, pages: [1] });
  const frames = sections.find(s => s.id === 'method').blocks.find(b => b.type === 'mechanism').frames;
  frames.forEach((f, i) => { f.diagram = { nodes: [{ id: 'input', label: bi('输入', 'Input'), x: .2, y: .5, state: 'active' }, { id: 'output', label: bi('输出', 'Output'), x: .8, y: .5, state: i ? 'revealed' : 'hidden' }], edges: i ? [{ from: 'input', to: 'output', kind: 'forward' }] : [] }; });
  return { version: 1, skill: { id: 'paper-deep-reading' }, title: bi('图文精读测试', 'Illustrated reading fixture'), subtitle: bi('受控测试文档', 'Controlled test document'), sourceDigest: 'a'.repeat(64), pageCount: 1, sections, assets: [{ id: 'figure-example', path: relative, width: 640, height: 200, page: 1, label: 'Figure 1', alt: bi('受控流程图', 'Controlled process diagram'), source, crop: { x: .05, y: .1, width: .9, height: .7 } }], warnings: [], assetReview: [] };
}
module.exports = { bi, report, samplePdf };
