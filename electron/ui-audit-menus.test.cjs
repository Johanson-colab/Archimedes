const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const projectSidebar = read("src", "ProjectSidebar.tsx");
const rightWorkbench = read("src", "RightWorkbench.tsx");
const proactive = read("src", "ProactiveAgentPanel.tsx");
const css = read("src", "styles.css");

function menuBlock(source, className) {
  const start = source.indexOf(`className="${className}`);
  assert.notEqual(start, -1, `${className} menu should exist`);
  const end = source.indexOf("</div>", start);
  return source.slice(start, end);
}

test("more menus are text-only", () => {
  const projectMenu = projectSidebar.slice(projectSidebar.indexOf('className="project-more-menu"'));
  const projectMenuEnd = projectMenu.indexOf("</div>}");
  assert.doesNotMatch(projectMenu.slice(0, projectMenuEnd), /<[A-Z][A-Za-z]+\s+size=/);
  assert.doesNotMatch(rightWorkbench, /<Settings2/);
  assert.doesNotMatch(rightWorkbench, /menuitem[^>]*>\{tab\.icon\}/);
  const workbenchMore = menuBlock(rightWorkbench, "workbench-menu workbench-more-menu");
  assert.doesNotMatch(workbenchMore, /<[A-Z][A-Za-z]+\s+size=/);
  assert.doesNotMatch(proactive.slice(proactive.indexOf('className="proactive-menu"')), /<[A-Z][A-Za-z]+\s+size=/);
});

test("more menus use a larger 12px label with compact rows", () => {
  assert.match(css, /\.project-more-menu \{[\s\S]*?gap: 0; padding: 3px;/);
  assert.match(css, /\.project-more-menu button \{[\s\S]*?height: 32px;[\s\S]*?font-size: 12px;/);
  assert.match(css, /\.workbench-menu \{[\s\S]*?padding: 3px;/);
  assert.match(css, /\.workbench-menu button \{[\s\S]*?height: 32px;[\s\S]*?font-size: 12px;/);
  assert.match(css, /\.proactive-menu button \{[\s\S]*?height: 32px;[\s\S]*?font-size: 12px;/);
});
