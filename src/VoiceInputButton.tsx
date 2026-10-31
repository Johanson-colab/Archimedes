import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic } from "lucide-react";

type VoiceInputButtonProps = {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  onTranscribe: (audio: ArrayBuffer, mimeType: string, language?: string) => Promise<{ text: string }>;
  onRequestPermission: () => Promise<boolean>;
  language?: string;
};

type VoiceState = "idle" | "requesting" | "recording" | "transcribing";

const MAX_RECORDING_MS = 120_000;

function friendlyError(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? String((error as { name?: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access was denied. Allow microphone access in System Settings.";
  if (name === "NotFoundError") return "No microphone was found.";
  if (name === "NotReadableError") return "The microphone is already in use by another app.";
  return error instanceof Error ? error.message : String(error);
}

export default function VoiceInputButton({ onTranscript, onError, onTranscribe, onRequestPermission, language }: VoiceInputButtonProps) {
  const [state, setState] = useState<VoiceState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const callbacksRef = useRef({ onTranscript, onError, onTranscribe, onRequestPermission, language });
  callbacksRef.current = { onTranscript, onError, onTranscribe, onRequestPermission, language };

  function clearTimer() {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function releaseStream() {
    clearTimer();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  function fail(error: unknown) {
    releaseStream();
    if (!mountedRef.current) return;
    callbacksRef.current.onError(friendlyError(error));
    setState("idle");
  }

  async function start() {
    setState("requesting");
    callbacksRef.current.onError("");
    try {
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new Error("Voice input is not available on this device.");
      const allowed = await callbacksRef.current.onRequestPermission();
      if (!allowed) throw new DOMException("Microphone access was denied.", "NotAllowedError");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("error", () => fail(new Error("Voice recording failed.")));
      recorder.addEventListener("stop", () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        releaseStream();
        if (!mountedRef.current) return;
        if (!chunks.length) {
          setState("idle");
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 1_000) {
          callbacksRef.current.onError("No speech was detected. Try again.");
          setState("idle");
          return;
        }
        setState("transcribing");
        void blob.arrayBuffer()
          .then((audio) => callbacksRef.current.onTranscribe(audio, blob.type, callbacksRef.current.language))
          .then((result) => {
            if (!mountedRef.current) return;
            const text = result.text.trim();
            if (!text) throw new Error("No speech was detected. Try again.");
            callbacksRef.current.onTranscript(text);
            setState("idle");
          })
          .catch((error) => fail(error));
      });
      recorder.start(250);
      setState("recording");
      timerRef.current = window.setTimeout(() => {
        const active = recorderRef.current;
        if (active && active.state !== "inactive") active.stop();
      }, MAX_RECORDING_MS);
    } catch (error) {
      fail(error);
    }
  }

  function stop() {
    clearTimer();
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      releaseStream();
      setState("idle");
      return;
    }
    recorder.stop();
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
    };
  }, []);

  const busy = state === "requesting" || state === "transcribing";
  const label = state === "recording" ? "Stop voice input" : state === "transcribing" ? "Transcribing voice input" : "Voice input";

  return <button
    type="button"
    className={`conversation-voice ${state}`}
    onClick={() => state === "recording" ? stop() : state === "idle" ? void start() : undefined}
    disabled={busy}
    title={label}
    aria-label={label}
    aria-pressed={state === "recording"}
  >
    {busy ? <LoaderCircle className="spin" size={15} /> : <Mic size={15} />}
  </button>;
}
