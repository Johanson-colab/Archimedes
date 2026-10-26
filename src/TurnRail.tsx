import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useUISettings } from "./i18n";

type TurnRailMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: ResearchSource[];
  created_at?: string;
};

type Turn = {
  id: string;
  question: string;
  meta: string;
};

const ITEM_HEIGHT = 47;
const ITEM_CENTER = ITEM_HEIGHT / 2;

function formatTurnTime(value: string | undefined, language: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(language === "zh" ? "zh-CN" : "en-US", { hour: "numeric", minute: "2-digit" });
}

export default function TurnRail({ messages, scrollRef }: { messages: TurnRailMessage[]; scrollRef: RefObject<HTMLDivElement | null> }) {
  const { t, language } = useUISettings();
  const turnSignature = messages.map((message) => message.role === "user"
    ? `u:${message.id}:${message.created_at ?? ""}:${message.text}`
    : `a:${message.sources?.length ?? 0}`).join("|");
  const turns = useMemo<Turn[]>(() => {
    const result: Turn[] = [];
    messages.forEach((message, index) => {
      if (message.role !== "user") return;
      let assistant: TurnRailMessage | undefined;
      for (let next = index + 1; next < messages.length; next += 1) {
        if (messages[next].role === "user") break;
        if (messages[next].role === "assistant") { assistant = messages[next]; break; }
      }
      const sourceCount = assistant?.sources?.length ?? 0;
      const sourceLabel = sourceCount
        ? sourceCount === 1 ? t("{count} source", { count: sourceCount }) : t("{count} sources", { count: sourceCount })
        : "";
      const time = formatTurnTime(message.created_at, language);
      result.push({
        id: message.id,
        question: message.text.trim(),
        meta: [sourceLabel, time].filter(Boolean).join(" · "),
      });
    });
    return result;
  }, [language, t, turnSignature]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [tip, setTip] = useState<{ index: number; top: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = Math.min(activeIndex, Math.max(0, turns.length - 1));

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const update = () => setVisible(container.clientWidth >= 900);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollRef]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || turns.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const containerTop = container.getBoundingClientRect().top;
      const anchors = new Map<string, HTMLElement>();
      for (const element of container.querySelectorAll<HTMLElement>("[data-turn-id]")) {
        if (element.dataset.turnId) anchors.set(element.dataset.turnId, element);
      }
      let nextActive = 0;
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 6;
      if (atBottom) {
        nextActive = turns.length - 1;
      } else {
        const threshold = Math.min(140, container.clientHeight * 0.22);
        for (let index = 0; index < turns.length; index += 1) {
          const element = anchors.get(turns[index].id);
          if (!element) continue;
          if (element.getBoundingClientRect().top - containerTop <= threshold) nextActive = index;
          else break;
        }
      }
      setActiveIndex((current) => current === nextActive ? current : nextActive);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    frame = requestAnimationFrame(update);
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef, turns]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const item = itemRefs.current[active];
    if (!viewport || !item) return;
    const padding = 14;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < viewport.scrollTop + padding) viewport.scrollTop = Math.max(0, top - padding);
    else if (bottom > viewport.scrollTop + viewport.clientHeight - padding) viewport.scrollTop = bottom - viewport.clientHeight + padding;
  }, [active]);

  if (turns.length < 2) return null;

  function showTip(index: number, element: HTMLButtonElement) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const center = element.offsetTop + element.offsetHeight / 2 - viewport.scrollTop;
    setTip({ index, top: Math.max(34, Math.min(center, viewport.clientHeight - 34)) });
  }

  function hideTip() {
    setTip(null);
  }

  function jumpTo(index: number) {
    const container = scrollRef.current;
    const turn = turns[index];
    if (!container || !turn) return;
    const anchor = Array.from(container.querySelectorAll<HTMLElement>("[data-turn-id]")).find((element) => element.dataset.turnId === turn.id);
    if (!anchor) return;
    const top = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 18;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    setActiveIndex(index);
    setTip(null);
    container.scrollTo({ top: Math.max(0, top), behavior });
  }

  const tipTurn = tip ? turns[tip.index] : null;

  return <nav
    className={visible ? "turn-rail" : "turn-rail hidden"}
    aria-label={t("Conversation turns")}
    style={{ "--turn-count": Math.max(1, turns.length) } as CSSProperties}
    onMouseLeave={hideTip}
  >
    <div className="turn-rail-viewport" ref={viewportRef} onScroll={hideTip}>
      <div className="turn-rail-track">
        <span className="turn-rail-line" aria-hidden="true" />
        <span className="turn-rail-progress" aria-hidden="true" style={{ height: `${active * ITEM_HEIGHT + ITEM_CENTER}px` }} />
        {turns.map((turn, index) => <button
          key={turn.id}
          type="button"
          ref={(element) => { itemRefs.current[index] = element; }}
          className={`turn-rail-item ${index < active ? "done" : index === active ? "active" : "future"}`}
          aria-current={index === active ? "step" : undefined}
          aria-label={`${t("Jump to turn {count}", { count: index + 1 })}: ${turn.question}`}
          onMouseEnter={(event) => showTip(index, event.currentTarget)}
          onFocus={(event) => showTip(index, event.currentTarget)}
          onBlur={hideTip}
          onClick={() => jumpTo(index)}
        >
          <span className="turn-rail-tick" aria-hidden="true" />
        </button>)}
      </div>
    </div>
    {tip && tipTurn && <div className="turn-rail-tip" role="tooltip" aria-hidden="true" style={{ top: tip.top }}>
      <p>{tipTurn.question}</p>
      {tipTurn.meta && <small>{tipTurn.meta}</small>}
    </div>}
  </nav>;
}
