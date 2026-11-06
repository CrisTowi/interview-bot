import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CaptionsIcon,
  HangUpIcon,
  KeyboardIcon,
  MicIcon,
  MicOffIcon,
  MutedIcon,
  Silhouette,
  TranscriptIcon,
  VolumeIcon,
} from '../components/icons';
import { createAgent, type InterviewAgent } from '../engines/agent';
import { useSpeechInput } from '../engines/speechInput';
import { createVoice, type VoiceEngine } from '../engines/voice';
import { buildSystemPrompt, focusTitle, kickoffMessage, pickInterviewerName } from '../lib/prompts';
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

/** A simulated video call: the interviewer's tile, your tile, live captions and call controls. */
export function Interview({ onEnd }: { onEnd: (transcript: ChatMessage[]) => void }) {
  const { profile, settings, history } = useApp();
  // Frozen for the whole session: the prompt is built once from profile + past summaries.
  const interviewerName = useMemo(() => pickInterviewerName(profile.lang), []);
  const system = useMemo(() => buildSystemPrompt(profile, history, interviewerName), []);

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
  const mic = useSpeechInput(profile.lang, setInput);
  const [captions, setCaptions] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(!mic.supported);
  /** Set when the candidate turns the mic off: that means "I'm done answering". */
  const sendWhenMicStops = useRef(false);
  const transcriptEnd = useRef<HTMLDivElement>(null);

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
    if (!mic.listening && sendWhenMicStops.current) {
      sendWhenMicStops.current = false;
      send();
    }
  }, [mic.listening]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, transcriptOpen]);

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
    voice.current?.stop();
    setInput('');
    advance([...messages, { role: 'user', content: text }]);
  }

  function toggleMic() {
    if (mic.listening) {
      sendWhenMicStops.current = true;
      return mic.stop();
    }
    voice.current?.stop();
    mic.start(input.trim());
  }

  function toggleMute() {
    if (!muted) voice.current?.stop();
    setMuted(!muted);
  }

  function end() {
    sendWhenMicStops.current = false;
    mic.stop();
    voice.current?.stop();
    onEnd(messages);
  }

  const visible = messages.filter((m) => !m.hidden);
  const lastAssistant = [...visible].reverse().find((m) => m.role === 'assistant');
  const lastIsUser = messages[messages.length - 1]?.role === 'user';
  // The mic stopped on its own (e.g. after a silence) with words captured: let the candidate decide.
  const pendingDraft = !mic.listening && !keyboard && !thinking && input.trim() !== '';

  let caption: ReactNode = null;
  if (mic.listening) {
    caption = (
      <>
        <strong>Tú:</strong> {input || 'Escuchando…'}
      </>
    );
  } else if (pendingDraft) {
    caption = (
      <>
        <strong>Tú:</strong> {input}
        <span className="caption-actions">
          <button className="link" onClick={send}>
            Enviar respuesta
          </button>
          <button className="link" onClick={toggleMic}>
            Seguir hablando
          </button>
        </span>
      </>
    );
  } else if (thinking) {
    caption =
      download !== null ? (
        `Descargando el modelo local… ${Math.round(download * 100)}%`
      ) : (
        <span className="caption-muted">
          {interviewerName} está pensando <span className="dots" />
        </span>
      );
  } else if (lastAssistant) {
    caption = (
      <>
        <strong>{interviewerName}:</strong> {lastAssistant.content}
      </>
    );
  }

  return (
    <main className="call">
      <div className="call-body">
        <section className="stage" aria-label="Videollamada">
          <div className="stage-top">
            <span>
              {focusTitle(profile.focus)} en {profile.company}
            </span>
            <span className="call-timer">{elapsed}</span>
          </div>

          <div className={`tile-main ${speaking ? 'speaking' : ''}`}>
            <div className="avatar">
              <Silhouette className="silhouette" />
            </div>
          </div>
          <span className="tile-label main-label">
            {speaking && (
              <span className="eq" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
            {interviewerName}, {profile.company}
          </span>

          <div className={`tile-self ${mic.listening ? 'speaking' : ''}`}>
            <Silhouette className="silhouette" />
            <span className="tile-label">
              {mic.listening ? <MicIcon /> : <MicOffIcon />}
              Tú
            </span>
          </div>

          {error ? (
            <div className="caption error-caption" role="alert">
              {error}{' '}
              {lastIsUser && !thinking && (
                <button className="link" onClick={() => advance(messages)}>
                  Reintentar
                </button>
              )}
            </div>
          ) : (
            captions &&
            caption && (
              <div className="caption" aria-live="polite">
                {caption}
              </div>
            )
          )}
        </section>

        {transcriptOpen && (
          <aside className="transcript-panel" aria-label="Transcripción">
            <header>
              <span>Transcripción</span>
              <button className="icon-btn" onClick={() => setTranscriptOpen(false)} aria-label="Cerrar transcripción">
                ✕
              </button>
            </header>
            <div className="transcript-lines">
              {visible.map((m, i) => (
                <p key={i} className={`tline ${m.role}`}>
                  <strong>{m.role === 'assistant' ? interviewerName : 'Tú'}</strong>
                  {m.content}
                </p>
              ))}
              <div ref={transcriptEnd} />
            </div>
          </aside>
        )}
      </div>

      {keyboard && (
        <div className="composer-box call-composer">
          <textarea
            autoFocus
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
            placeholder="Escribe tu respuesta (Enter para enviar)"
            rows={1}
          />
          <button className="primary" onClick={send} disabled={!input.trim() || thinking}>
            Enviar
          </button>
        </div>
      )}

      <footer className="call-controls">
        <div className="control-group">
          <button
            className={`control mic-control ${mic.listening ? 'on' : ''}`}
            onClick={toggleMic}
            disabled={!mic.supported || thinking}
            aria-pressed={mic.listening}
            title={!mic.supported ? 'Tu navegador no permite dictar' : mic.listening ? 'Terminar y enviar tu respuesta' : 'Responder hablando'}
          >
            {mic.listening ? <MicIcon /> : <MicOffIcon />}
            <span>{mic.listening ? 'Terminar respuesta' : 'Responder'}</span>
          </button>
          <button
            className={`control ${keyboard ? 'active' : ''}`}
            onClick={() => setKeyboard(!keyboard)}
            aria-pressed={keyboard}
            title="Escribir respuesta"
            aria-label="Escribir respuesta"
          >
            <KeyboardIcon />
          </button>
          <button
            className={`control ${captions ? 'active' : ''}`}
            onClick={() => setCaptions(!captions)}
            aria-pressed={captions}
            title="Subtítulos"
            aria-label="Subtítulos"
          >
            <CaptionsIcon />
          </button>
          <button
            className={`control ${transcriptOpen ? 'active' : ''}`}
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            aria-pressed={transcriptOpen}
            title="Transcripción"
            aria-label="Transcripción"
          >
            <TranscriptIcon />
          </button>
          <button
            className={`control ${muted ? 'off' : ''}`}
            onClick={toggleMute}
            aria-pressed={muted}
            title={muted ? 'Activar la voz del entrevistador' : 'Silenciar al entrevistador'}
            aria-label={muted ? 'Activar la voz del entrevistador' : 'Silenciar al entrevistador'}
          >
            {muted ? <MutedIcon /> : <VolumeIcon />}
          </button>
        </div>
        <button className="control hangup" onClick={end} title="Terminar la entrevista">
          <HangUpIcon />
          <span>Terminar</span>
        </button>
      </footer>
      <p className="hint call-hint">
        {mic.supported
          ? 'Pulsa Responder, habla y pulsa Terminar respuesta cuando acabes. Estructura tu respuesta: situación, tarea, acción y resultado.'
          : 'Tu navegador no permite dictar: responde escribiendo. Estructura tu respuesta: situación, tarea, acción y resultado.'}
      </p>
    </main>
  );
}
