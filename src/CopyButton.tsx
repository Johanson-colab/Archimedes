import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyButton({ text, label = "Copy code" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  async function copy() {
    if (!text) return;
    const bridge = window.researchDesk;
    if (bridge?.writeClipboardText) await bridge.writeClipboardText(text);
    else await navigator.clipboard.writeText(text);
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  }

  return <button type="button" className="code-copy-button" onClick={() => void copy()} title={copied ? "Copied" : label} aria-label={copied ? "Copied" : label}>
    {copied ? <Check size={12} /> : <Copy size={12} />}
    <span>{copied ? "Copied" : "Copy"}</span>
  </button>;
}
