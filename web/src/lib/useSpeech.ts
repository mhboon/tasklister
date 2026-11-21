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
 * Joins the results of one recognition session. Some browsers (Chrome on Android) repeat the
 * sentence so far in each new result: a result that extends the previous one replaces it.
 */
export function joinResults(texts: string[]): string {
  const parts: string[] = [];
  for (const raw of texts) {
    const t = raw.trim();
    if (!t) continue;
    const last = parts[parts.length - 1];
    if (last !== undefined && t.toLowerCase().startsWith(last.toLowerCase())) parts[parts.length - 1] = t;
    else parts.push(t);
  }
  return parts.join(' ');
}

const GIVE_UP_AFTER = 3; // restarts that end at once mean the browser will not listen

/**
 * Dictation through the browser, until the user stops it. A browser ends a session on its own
 * after a pause, so the session is restarted and the text so far is kept. `onText` gets the whole
 * dictation so far. Not available in every browser (Firefox, some installed iPhone apps):
 * `supported` is false there and the mic should not be shown.
 */
export function useSpeech(onText: (text: string) => void, onError: (message: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const wanted = useRef(false); // the user has not pressed stop
  const done = useRef(''); // text from sessions that have ended
  const session = useRef(''); // text of the running session
  const quickEnds = useRef(0);
  const startedAt = useRef(0);
  const restart = useRef<() => void>(() => {});
  const handlers = useRef({ onText, onError });
  useEffect(() => {
    handlers.current = { onText, onError };
  });
  useEffect(
    () => () => {
      wanted.current = false;
      recRef.current?.abort();
    },
    []
  );

  const total = () => [done.current, session.current].filter(Boolean).join(' ');

  const begin = useCallback(() => {
    const Ctor = ctor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    session.current = '';
    startedAt.current = Date.now();
    rec.onresult = (e) => {
      session.current = joinResults(Array.from(e.results).map((r) => r[0].transcript));
      handlers.current.onText(total());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wanted.current = false;
        handlers.current.onError('The microphone is blocked for this site. Allow it in the browser settings.');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        wanted.current = false;
        handlers.current.onError('Could not understand that. Please try again.');
      }
    };
    rec.onend = () => {
      done.current = total();
      session.current = '';
      quickEnds.current = Date.now() - startedAt.current < 800 ? quickEnds.current + 1 : 0;
      if (wanted.current && quickEnds.current < GIVE_UP_AFTER) {
        try {
          restart.current(); // the browser ended the session, the user did not
          return;
        } catch {
          // fall through and stop
        }
      }
      wanted.current = false;
      setListening(false);
    };
    recRef.current = rec;
    rec.start();
  }, []);
  useEffect(() => {
    restart.current = begin;
  }, [begin]);

  const start = useCallback(() => {
    if (!ctor()) return;
    wanted.current = true;
    done.current = '';
    quickEnds.current = 0;
    setListening(true);
    try {
      begin();
    } catch {
      wanted.current = false;
      setListening(false);
    }
  }, [begin]);

  /** Ends the dictation; the text so far stays. */
  const stop = useCallback(() => {
    wanted.current = false;
    recRef.current?.stop();
  }, []);

  return { supported: ctor() !== undefined, listening, start, stop };
}
