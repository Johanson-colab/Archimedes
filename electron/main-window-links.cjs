// Renderer Markdown uses target=_blank for ordinary web links. Never let that
// create an unmanaged Electron child window, including for local App URLs.
function installMainWindowLinks(webContents, { openExternal, onError = () => {} }) {
  webContents.setWindowOpenHandler(({ url }) => {
    let allowed = false;
    try { allowed = ["http:", "https:"].includes(new URL(url).protocol); } catch { /* deny invalid URLs */ }
    if (allowed) Promise.resolve().then(() => openExternal(url)).catch(() => onError());
    return { action: "deny" };
  });
}
module.exports = { installMainWindowLinks };
