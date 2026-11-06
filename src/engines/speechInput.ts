import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '../types';

const LOCALES: Record<Lang, string> = { es: 'es-ES', en: 'en-US' };

function getRecognition(): (new () => any) | undefined {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Dictation into the answer box via the Web Speech API (where the browser supports it). */
export function useSpeechInput(lang: Lang, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<any>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const start = useCallback(
    (prefix: string) => {
      const Recognition = getRecognition();
      if (!Recognition) return;
      const rec = new Recognition();
      rec.lang = LOCALES[lang];
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: any) => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        onTextRef.current([prefix, text.trim()].filter(Boolean).join(' '));
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      rec.start();
      recognition.current = rec;
      setListening(true);
    },
    [lang],
  );

  const stop = useCallback(() => recognition.current?.stop(), []);

  useEffect(() => () => recognition.current?.abort(), []);

  return { supported: !!getRecognition(), listening, start, stop };
}
