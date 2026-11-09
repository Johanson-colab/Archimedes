let loading: Promise<void> | null = null;
const CONTAINER_ID = "opencode-file-icon-sprite";

/**
 * Lazily injects the OpenCode/vscode-icons sprite once. The sprite is a large
 * raw SVG chunk, so it is only fetched when the OpenCode icon style is used.
 */
export function ensureOpenCodeSprite(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (document.getElementById(CONTAINER_ID)) return Promise.resolve();
  loading ??= import("../../assets/file-icons/opencode-sprite.svg?raw")
    .then(({ default: sprite }) => {
      if (document.getElementById(CONTAINER_ID)) return;
      const host = document.createElement("div");
      host.id = CONTAINER_ID;
      host.setAttribute("aria-hidden", "true");
      host.style.position = "absolute";
      host.style.width = "0";
      host.style.height = "0";
      host.style.overflow = "hidden";
      host.innerHTML = sprite;
      document.body.prepend(host);
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}
