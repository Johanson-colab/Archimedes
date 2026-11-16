function shellQuote(value) { return `'${String(value ?? "").replace(/'/g, `'\\''`)}'`; }
function quoteRemotePath(value) {
  const text = String(value ?? "");
  if (text === "~") return '"$HOME"';
  if (text.startsWith("~/")) return `"$HOME"/${shellQuote(text.slice(2))}`;
  return shellQuote(text);
}
module.exports = { shellQuote, quoteRemotePath };
