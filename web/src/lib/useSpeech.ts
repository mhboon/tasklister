import { useCallback, useEffect, useRef, useState } from 'react';

// The browser's speech recognition is not in TypeScript's DOM types.
interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/**
 * Dictation through the browser. `onText` gets the whole sentence so far while
 * speaking. Not available in every browser (Firefox, some installed iPhone apps):
 * `supported` is false there and the mic should not be shown.
 */
export function useSpeech(onText: (text: string) => void, onError: (message: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const handlers = useRef({ onText, onError });
  useEffect(() => {
    handlers.current = { onText, onError };
  });
  useEffect(() => () => recRef.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = ctor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(' ');
      handlers.current.onText(text);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        handlers.current.onError('The microphone is blocked for this site. Allow it in the browser settings.');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        handlers.current.onError('Could not understand that. Please try again.');
      }
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => recRef.current?.stop(), []);

  return { supported: ctor() !== undefined, listening, start, stop };
}
