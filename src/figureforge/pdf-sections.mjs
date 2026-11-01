// Select whole, page-labelled PDF passages by figure-related terms, following
// the Top-Conf FigureForge fallback strategy rather than silently taking only
// the first pages. The full text remains local until the user requests analysis.
export function selectRelevantPdfPages(pages, requirements = "", limit = 60_000) {
  const terms = ["figure", "diagram", "illustrat", "visualiz", "method", "approach", "framework", "architecture", "pipeline", "workflow", "module", "component", "input", "output", "result", "experiment", "ablation", "图", "方法", "流程", "框架", "架构", "模块", "输入", "输出", "结果", "实验", "消融"];
  const requested = requirements.toLowerCase().split(/[\s,，;；、]+/).filter((term) => term.length > 1).slice(0, 8);
  const ranked = pages.map((page, index) => {
    const body = String(page).toLowerCase();
    return { page: String(page), index, score: terms.reduce((n, term) => n + Number(body.includes(term)), 0) + requested.reduce((n, term) => n + 4 * Number(body.includes(term)), 0) };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  let used = 0;
  return ranked.map(({ page }) => {
    const remaining = limit - used - (used ? 2 : 0);
    if (remaining <= 0) return "";
    const part = page.slice(0, remaining); used += part.length + (used ? 2 : 0); return part;
  }).filter(Boolean).join("\n\n");
}
