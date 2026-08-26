declare module "react-syntax-highlighter/dist/esm/prism-light" {
  import type { ComponentType } from "react";
  import type { SyntaxHighlighterProps } from "react-syntax-highlighter";

  const SyntaxHighlighter: ComponentType<SyntaxHighlighterProps> & {
    registerLanguage(name: string, grammar: unknown): void;
  };
  export default SyntaxHighlighter;
}

declare module "react-syntax-highlighter/dist/esm/languages/prism/*" {
  const grammar: unknown;
  export default grammar;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism/*" {
  import type { CSSProperties } from "react";

  const style: Record<string, CSSProperties>;
  export default style;
}
