import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionResultEvent = {
  results: ArrayLike<{ [index: number]: { transcript: string } }>;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

function getRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * 按住说话 → 语音识别（Web Speech API，Chromium 内置）→ 回调文本。
 * 识别结果持续累积到 onTranscript，松手后自动 stop。
 */
export function useSpeechRecognition({
  onTranscript,
  onError,
}: {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => getRecognition() !== null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognition();
    if (!Ctor) {
      onError("当前环境不支持语音识别（需要 Chromium 内置语音服务）。");
      return;
    }
    if (recognitionRef.current) return;
    const recognition = new Ctor();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join("");
      onTranscript(transcript);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setListening(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        onError("语音识别被拒绝或不可用，请检查麦克风权限。");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        onError(`语音识别出错（${event.error}）。`);
      }
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [onTranscript, onError]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { supported, listening, start, stop };
}
