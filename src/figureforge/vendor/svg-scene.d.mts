import type { FigureScene } from "../reconstruction.mjs";
export function parseSvgScene(svg: string): FigureScene & { warnings: string[] };
