import protocol from "../shared/research-app-context.json";

/** Only visual context crosses this boundary; no bridge methods, paths or credentials. */
export function researchAppContext(language = "en") {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  return { type: "archimedes:context", theme: root.dataset.theme === "paper" ? "paper" : "charcoal", language,
    fontFamily: getComputedStyle(document.querySelector(".codex-shell") || document.body).fontFamily,
    tokens: Object.fromEntries(protocol.tokens.map(name => [name, style.getPropertyValue(name).trim()]).filter(([, value]) => value)),
  };
}
