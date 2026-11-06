import { useEffect, useMemo, useRef, useState } from 'react';
import { MicIcon, MutedIcon, VolumeIcon } from '../components/icons';
import { createAgent, type InterviewAgent } from '../engines/agent';
import { useSpeechInput } from '../engines/speechInput';
import { createVoice, type VoiceEngine } from '../engines/voice';
import { buildSystemPrompt, focusTitle, kickoffMessage } from '../lib/prompts';
import { useApp } from '../store';
import type { ChatMessage } from '../types';

function useElapsed(): string {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function Interview({ onEnd }: { onEnd: (transcript: ChatMessage[]) => void }) {
  const { profile, settings, history } = useApp();
  // Frozen for the whole session: the prompt is built once from profile + past summaries.
  const system = useMemo(() => buildSystemPrompt(profile, history), []);

  const agent = useRef<InterviewAgent | null>(null);
  const voice = useRef<VoiceEngine | null>(null);
  const mounted = useRef(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(settings.tts === 'off');
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [error, setError] = useState('');
  const [download, setDownload] = useState<number | null>(null);
  const elapsed = useElapsed();
  const bottom = useRef<HTMLDivElement>(null);
  const mic = useSpeechInput(profile.lang, setInput);

  useEffect(() => {
    mounted.current = true;
    agent.current = createAgent(settings, profile.lang, (ratio) => setDownload(ratio < 1 ? ratio : null));
    voice.current = createVoice(settings, profile.lang);
    advance([kickoffMessage(profile.lang)]);
    return () => {
      mounted.current = false;
      agent.current?.destroy();
      voice.current?.stop();
    };
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  async function speak(text: string) {
    if (mutedRef.current || !voice.current) return;
    setSpeaking(true);
    try {
      await voice.current.speak(text);
    } catch (err) {
      if (mounted.current) setError(`No se pudo reproducir la voz: ${(err as Error).message}`);
    } finally {
      if (mounted.current) setSpeaking(false);
    }
  }

  async function advance(next: ChatMessage[]) {
    setMessages(next);
    setThinking(true);
    setError('');
    try {
      const text = (await agent.current!.reply(system, next)).trim();
      if (!mounted.current) return;
      setMessages([...next, { role: 'assistant', content: text }]);
      setThinking(false);
      speak(text);
    } catch (err) {
      if (!mounted.current) return;
      setThinking(false);
      setError((err as Error).message || 'Algo salió mal.');
    }
  }

  function send() {
    const text = input.trim();
    if (!text || thinking) return;
    mic.stop();
    voice.current?.stop();
    setInput('');
    advance([...messages, { role: 'user', content: text }]);
  }

  function toggleMic() {
    if (mic.listening) return mic.stop();
    voice.current?.stop();
    mic.start(input.trim());
  }

  function toggleMute() {
    if (!muted) voice.current?.stop();
    setMuted(!muted);
  }

  function end() {
    mic.stop();
    voice.current?.stop();
    onEnd(messages);
  }

  const visible = messages.filter((m) => !m.hidden);
  const currentIndex = visible.map((m) => m.role).lastIndexOf('assistant');
  const lastIsUser = messages[messages.length - 1]?.role === 'user';

  return (
    <main className="interview">
      <header className="interview-bar">
        <span>
          {focusTitle(profile.focus)} en {profile.company}
        </span>
        <div className="bar-actions">
          <span className="timer">{elapsed}</span>
          <button
            className={`icon-btn ${speaking ? 'live' : ''}`}
            onClick={toggleMute}
            aria-label={muted ? 'Activar voz' : 'Silenciar'}
            title={muted ? 'Activar voz' : 'Silenciar'}
          >
            {muted ? <MutedIcon /> : <VolumeIcon />}
          </button>
          <button className="secondary" onClick={end}>
            Terminar
          </button>
        </div>
      </header>

      <div className="transcript">
        {visible.map((m, i) => (
          <p key={i} className={`line ${m.role} ${i === currentIndex ? 'current' : ''}`}>
            {m.content}
          </p>
        ))}
        {thinking && (
          <p className="line assistant pending">
            {download !== null ? `Descargando el modelo local… ${Math.round(download * 100)}%` : <span className="dots" />}
          </p>
        )}
        {error && (
          <p className="error">
            {error}{' '}
            {lastIsUser && !thinking && (
              <button className="link" onClick={() => advance(messages)}>
                Reintentar
              </button>
            )}
          </p>
        )}
        <div ref={bottom} />
      </div>

      <footer className="composer">
        <div className="composer-box">
          {mic.supported && (
            <button
              className={`icon-btn ${mic.listening ? 'recording' : ''}`}
              onClick={toggleMic}
              aria-label={mic.listening ? 'Detener dictado' : 'Responder con voz'}
              title={mic.listening ? 'Detener dictado' : 'Responder con voz'}
            >
              <MicIcon />
            </button>
          )}
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (speaking) voice.current?.stop();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={mic.listening ? 'Escuchando…' : 'Escribe o dicta tu respuesta'}
            rows={1}
          />
          <button className="primary" onClick={send} disabled={!input.trim() || thinking}>
            Enviar
          </button>
        </div>
        <p className="hint">Estructura tu respuesta: situación, tarea, acción y resultado. Shift+Enter para una nueva línea.</p>
      </footer>
    </main>
  );
}
