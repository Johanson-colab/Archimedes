/** Render the current vector locally for manuscript formats that cannot include SVG. */
export async function figurePng(svg: string): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Could not render the figure for the manuscript.")); image.src = url; });
    const canvas = document.createElement("canvas");
    const scale = Math.min(2, 4096 / Math.max(image.naturalWidth || 1440, image.naturalHeight || 750));
    canvas.width = Math.max(1, Math.round((image.naturalWidth || 1440) * scale)); canvas.height = Math.max(1, Math.round((image.naturalHeight || 750) * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("Could not render the figure for the manuscript.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  } finally { URL.revokeObjectURL(url); }
}
