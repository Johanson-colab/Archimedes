import { useMemo } from "react";

type JsonTokenKind = "key" | "string" | "number" | "literal";

type JsonToken = {
  text: string;
  kind?: JsonTokenKind;
};

function tokenizeJson(text: string): JsonToken[] {
  const pattern = /("(?:\\u[\da-fA-F]{4}|\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?/g;
  const tokens: JsonToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) tokens.push({ text: text.slice(lastIndex, match.index) });
    if (match[2]) {
      tokens.push({ text: match[1], kind: "key" });
      tokens.push({ text: match[2] });
    } else if (match[3]) {
      tokens.push({ text: match[0], kind: "literal" });
    } else if (match[1]) {
      tokens.push({ text: match[0], kind: "string" });
    } else {
      tokens.push({ text: match[0], kind: "number" });
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) tokens.push({ text: text.slice(lastIndex) });
  return tokens;
}

export default function JsonCode({ value }: { value: unknown }) {
  const text = useMemo(() => JSON.stringify(value, null, 2) ?? "", [value]);
  const tokens = useMemo(() => tokenizeJson(text), [text]);

  return <pre className="trajectory-json">{tokens.map((token, index) => token.kind
    ? <span className={`json-token json-token-${token.kind}`} key={index}>{token.text}</span>
    : token.text)}</pre>;
}
