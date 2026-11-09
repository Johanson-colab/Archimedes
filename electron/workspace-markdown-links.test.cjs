const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const { readWorkspaceFile } = require('./workspace-files.cjs');

test('resolves local file links within the workspace on macOS and Windows', async () => {
  const { workspaceFileLink } = await import('../src/workspace-links.ts');
  const root = '/Users/test/AI Research';
  assert.equal(workspaceFileLink(`${root}/ideaspark_run/run/phase4/idea.std.zh.md`, root), 'ideaspark_run/run/phase4/idea.std.zh.md');
  assert.equal(workspaceFileLink('file:///Users/test/AI%20Research/result.md', root), 'result.md');
  assert.equal(workspaceFileLink('file://localhost/Users/test/AI%20Research/result.md', root), 'result.md');
  assert.equal(workspaceFileLink('./results/report%20en.md#L10', root), 'results/report en.md');
  assert.equal(workspaceFileLink('C:\\Research\\results\\report.md', 'C:\\Research'), 'results/report.md');
  assert.equal(workspaceFileLink('file:///C:/Research/results/report.md', 'C:\\Research'), 'results/report.md');
  for (const href of ['../private.md', '%2e%2e/private.md', `${root}-other/report.md`, 'file:///etc/passwd', 'file://remote/share/report.md', '//example.com/report.md', 'https://example.com/report.md', 'javascript:alert(1)', 'file:///Users/test/AI%20Research/report%00.md', '%xx.md']) {
    assert.equal(workspaceFileLink(href, root), null, href);
  }
});

test('clicking real Markdown file links opens the existing file preview and cancels navigation', async t => {
  const rootDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-links-')));
  const workspace = path.join(rootDirectory, 'AI Research');
  fs.mkdirSync(path.join(workspace, 'ideaspark_run/run/phase4'), { recursive: true });
  const relative = 'ideaspark_run/run/phase4/idea.std.zh.md';
  fs.writeFileSync(path.join(workspace, relative), '# 中文研究方案\n\nReal generated Markdown.');
  const outside = path.join(rootDirectory, 'outside.md');
  fs.writeFileSync(outside, 'outside');
  if (process.platform !== 'win32') {
    fs.symlinkSync(outside, path.join(workspace, 'linked.md'));
    assert.throws(() => readWorkspaceFile(workspace, 'linked.md'), /outside/);
  }
  t.after(() => fs.rmSync(rootDirectory, { recursive: true, force: true }));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://127.0.0.1:5173/' });
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const markdown = await import('react-markdown');
  const helpers = await import('../src/workspace-links.ts');
  const { transformWithOxc } = await import('vite');
  const source = fs.readFileSync(path.join(__dirname, '../src/WorkspaceMarkdownLink.tsx'), 'utf8');
  const { code } = await transformWithOxc(source.replace(/^import .*;$/gm, '').replace(/^export /gm, ''), 'workspace-link.tsx', { jsx: { runtime: 'classic' } });
  const moduleExports = new Function('React', 'createContext', 'useContext', 'useMemo', 'defaultUrlTransform', 'workspaceFileLink', `${code}\nreturn { WorkspaceMarkdownProvider, WorkspaceMarkdownLink, workspaceMarkdownUrlTransform };`)(React, React.createContext, React.useContext, React.useMemo, markdown.defaultUrlTransform, helpers.workspaceFileLink);
  const { WorkspaceMarkdownProvider, WorkspaceMarkdownLink, workspaceMarkdownUrlTransform } = moduleExports;
  const opened = [];
  const container = document.getElementById('root');
  const reactRoot = createRoot(container);
  const content = [
    `[中文版研究方案](<${workspace}/${relative}>)`,
    `[文件 URL](<${new URL(`file://${workspace}/${relative}`).href}>)`,
    `[相对路径](${relative})`,
    `[网页](https://example.com/paper)`,
    `[工作区外](<${outside}>)`,
    '[危险链接](javascript:alert%281%29)',
  ].join('\n\n');
  try {
    await React.act(async () => reactRoot.render(React.createElement(WorkspaceMarkdownProvider, {
      workspace, onOpenFile: file => { opened.push(readWorkspaceFile(workspace, file)); },
    }, React.createElement(markdown.default, { urlTransform: workspaceMarkdownUrlTransform, components: { a: WorkspaceMarkdownLink } }, content))));
    const anchors = [...container.querySelectorAll('a')];
    assert.equal(anchors.length, 4, 'outside and unsafe links cannot navigate');
    for (const anchor of anchors.slice(0, 3)) {
      const click = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, metaKey: anchor === anchors[0] });
      await React.act(async () => anchor.dispatchEvent(click));
      assert.equal(click.defaultPrevented, true);
      assert.equal(anchor.hasAttribute('target'), false);
    }
    assert.equal(opened.length, 3);
    assert.ok(opened.every(file => file.path === relative && file.kind === 'markdown' && file.content.includes('中文研究方案')));
    assert.equal(anchors[3].target, '_blank');
    assert.equal(anchors[3].href, 'https://example.com/paper');
    const middleClick = new dom.window.MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true });
    await React.act(async () => anchors[0].dispatchEvent(middleClick));
    assert.equal(middleClick.defaultPrevented, true);
    assert.equal(opened.length, 4);
    assert.equal(workspaceMarkdownUrlTransform('file:///tmp/image.png', 'src'), '');
  } finally {
    await React.act(async () => reactRoot.unmount());
    dom.window.close(); global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
