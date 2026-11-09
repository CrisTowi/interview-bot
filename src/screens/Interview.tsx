import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { createAgent, supportsTools, type AgentTool, type InterviewAgent } from '../engines/agent';
import { castInterviewer } from '../engines/casting';
import { useSpeechInput } from '../engines/speechInput';
import { createVoice, type VoiceEngine } from '../engines/voice';
import { capitalize, useT } from '../i18n';
import { createInterviewerTools } from '../lib/interviewerTools';
import { buildSystemPrompt, DURATIONS, kickoffMessage, plannedDuration, timeCheck } from '../lib/prompts';
import { focusOnMount } from '../components/ui';
import { APP_NAME, useDocumentTitle } from '../lib/title';
import { useApp } from '../store';
import type { ChatMessage, InterviewNote } from '../types';

/** Seconds since the call started. Measured from the clock, so it stays right if the tab is throttled. */
function useElapsedSeconds(startedAt: number): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return seconds;
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** A simulated video call: the interviewer's tile, your tile, live captions and call controls. */
/** How the interview ended: transcript, the interviewer's notes, and whether it ran in agent mode. */
export interface InterviewResult {
  transcript: ChatMessage[];
  notes: InterviewNote[];
  agentMode: boolean;
}

export function Interview({ onEnd }: { onEnd: (result: InterviewResult) => void }) {
  const { profile, settings, history } = useApp();
  // Chosen once per session, together with a voice of the same gender (see engines/casting.ts).
  const [interviewerName, setInterviewerName] = useState('');
  // Frozen for the whole session: built once from profile + past summaries + the interviewer.
  const system = useRef('');
  const gender = useRef<'female' | 'male' | null>(null);
  /** Agent mode = the model can use the interviewer's tools; basic mode = plain conversation. */
  const [agentMode, setAgentModeState] = useState<boolean | null>(null);
  // advance() and end() run from async callbacks that may predate the latest render, so they read refs.
  const agentModeRef = useRef(false);
  const nameRef = useRef('');
  const setAgentMode = (value: boolean) => {
    agentModeRef.current = value;
    setAgentModeState(value);
  };
  const tools = useRef<AgentTool[]>([]);
  const notes = useRef<InterviewNote[]>([]);
  /** The interviewer hung up (end_interview); we leave once the goodbye has been spoken. */
  const hangUpRequested = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);

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
  const [startedAt] = useState(() => Date.now());
  const elapsed = useElapsedSeconds(startedAt);
  const duration = plannedDuration(profile);
  const planned = DURATIONS[duration].minutes;
  /** Which time check the model has already received (see timeCheck in lib/prompts.ts). */
  const timeStage = useRef<0 | 1 | 2>(0);
  const t = useT();
  useDocumentTitle(`${t.title.interview(interviewerName || '…')} — ${APP_NAME}`);
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
    tools.current = createInterviewerTools({
      lang: profile.lang,
      notes: notes.current,
      startedAt,
      minutes: planned,
      onEnd: () => (hangUpRequested.current = true),
    });
    setThinking(true);
    Promise.all([castInterviewer(settings, profile.lang), supportsTools(settings)]).then(([cast, canUseTools]) => {
      if (!mounted.current) return;
      setInterviewerName(cast.name);
      nameRef.current = cast.name;
      setAgentMode(canUseTools);
      gender.current = cast.gender;
      system.current = buildSystemPrompt(profile, history, cast.name, cast.gender, canUseTools);
      voice.current = createVoice(settings, profile.lang, cast);
      advance([kickoffMessage(profile.lang)]);
    });
    return () => {
      mounted.current = false;
      agent.current?.destroy();
      voice.current?.stop();
    };
    // One interview per mount: casting, the prompt and the agent are frozen for the whole call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mic.listening && sendWhenMicStops.current) {
      sendWhenMicStops.current = false;
      send();
    }
    // Only the mic turning off matters here; send() reads the latest input when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (mounted.current) setError(t.interview.voiceError((err as Error).message));
    } finally {
      if (mounted.current) setSpeaking(false);
    }
  }

  function showMessages(next: ChatMessage[]) {
    messagesRef.current = next;
    setMessages(next);
  }

  async function advance(next: ChatMessage[]) {
    showMessages(next);
    setThinking(true);
    setError('');
    try {
      const useTools = !agent.current!.toolsUnsupported && system.current.includes('end_interview');
      // Time checks travel with the answer they were attached to, out of the transcript and the evaluation.
      const forModel = next.map((m) => (m.context ? { ...m, content: `${m.content}\n\n${m.context}` } : m));
      const text = (await agent.current!.reply(system.current, forModel, useTools ? tools.current : undefined)).trim();
      if (!mounted.current) return;
      // The model turned out not to support tools: switch to basic mode for the rest of the call.
      if (useTools && agent.current!.toolsUnsupported) {
        setAgentMode(false);
        system.current = buildSystemPrompt(profile, history, nameRef.current, gender.current, false);
      }
      const shown = text ? [...next, { role: 'assistant' as const, content: text }] : next;
      showMessages(shown);
      setThinking(false);
      await speak(text);
      // The interviewer hung up: let the goodbye sink in for a moment, then leave the call.
      if (hangUpRequested.current && mounted.current) setTimeout(() => mounted.current && end(), 1200);
    } catch (err) {
      if (!mounted.current) return;
      setThinking(false);
      setError((err as Error).message || t.common.genericError);
    }
  }

  function send() {
    const text = input.trim();
    if (!text || thinking) return;
    voice.current?.stop();
    setInput('');
    const check = timeCheck((Date.now() - startedAt) / 60_000, duration, timeStage.current);
    if (check) timeStage.current = check.stage;
    advance([...messages, { role: 'user', content: text, context: check?.note }]);
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
    onEnd({ transcript: messagesRef.current, notes: notes.current, agentMode: agentModeRef.current });
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
        <strong>{t.interview.you}:</strong> {input ? <span lang={profile.lang}>{input}</span> : t.interview.listening}
      </>
    );
  } else if (pendingDraft) {
    caption = (
      <>
        <strong>{t.interview.you}:</strong> <span lang={profile.lang}>{input}</span>
        <span className="caption-actions">
          <button className="link" onClick={send}>
            {t.interview.sendAnswer}
          </button>
          <button className="link" onClick={toggleMic}>
            {t.interview.keepTalking}
          </button>
        </span>
      </>
    );
  } else if (thinking) {
    caption =
      download !== null ? (
        t.interview.downloading(Math.round(download * 100))
      ) : (
        <span className="caption-muted">
          {interviewerName ? t.interview.thinking(interviewerName) : t.interview.connecting} <span className="dots" />
        </span>
      );
  } else if (lastAssistant) {
    caption = (
      <>
        <strong>{interviewerName}:</strong> <span lang={profile.lang}>{lastAssistant.content}</span>
      </>
    );
  }

  return (
    <main className="call" id="main" tabIndex={-1}>
      <h1 className="sr-only">{t.title.interview(interviewerName)}</h1>
      <div className="call-body">
        <section className="stage" aria-label={t.interview.call}>
          <div className="stage-top">
            <span>{t.interview.topic(capitalize(t.options.focusLabels[profile.focus]), profile.company)}</span>
            <span className="stage-meta">
              {agentMode !== null && (
                <span
                  className={agentMode ? 'mode-badge agent' : 'mode-badge'}
                  title={agentMode ? t.interview.agentModeTitle : t.interview.basicModeTitle}
                >
                  {agentMode ? t.interview.agentMode : t.interview.basicMode}
                  <span className="sr-only">
                    : {agentMode ? t.interview.agentModeTitle : t.interview.basicModeTitle}
                  </span>
                </span>
              )}
              <span className={elapsed >= planned * 60 ? 'call-timer over' : 'call-timer'}>
                {clock(elapsed)} <span className="call-timer-total">/ {planned}:00</span>
              </span>
            </span>
          </div>
          <div
            className={elapsed >= planned * 60 ? 'call-progress over' : 'call-progress'}
            role="progressbar"
            aria-label={t.interview.timeLabel}
            aria-valuemin={0}
            aria-valuemax={planned}
            aria-valuenow={Math.min(planned, Math.floor(elapsed / 60))}
            aria-valuetext={t.interview.timeValue(Math.floor(elapsed / 60), planned)}
          >
            <span style={{ width: `${Math.min(100, (elapsed / (planned * 60)) * 100)}%` }} />
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
            {interviewerName ? `${interviewerName}, ${profile.company}` : t.interview.connecting}
          </span>

          <div className={`tile-self ${mic.listening ? 'speaking' : ''}`}>
            <Silhouette className="silhouette" />
            <span className="tile-label">
              {mic.listening ? <MicIcon /> : <MicOffIcon />}
              {t.interview.you}
            </span>
          </div>

          {error ? (
            <div className="caption error-caption" role="alert">
              {error}{' '}
              {lastIsUser && !thinking && (
                <button className="link" onClick={() => advance(messages)}>
                  {t.common.retry}
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
          <aside className="transcript-panel" aria-label={t.interview.transcript}>
            <header>
              <span>{t.interview.transcript}</span>
              <button
                className="icon-btn"
                onClick={() => setTranscriptOpen(false)}
                aria-label={t.interview.closeTranscript}
              >
                ✕
              </button>
            </header>
            <div className="transcript-lines">
              {visible.map((m, i) => (
                <p key={i} className={`tline ${m.role}`}>
                  <strong>{m.role === 'assistant' ? interviewerName : t.interview.you}</strong>
                  <span lang={profile.lang}>{m.content}</span>
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
            ref={focusOnMount}
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
            placeholder={t.interview.typePlaceholder}
            aria-label={t.interview.typeAnswer}
            rows={1}
          />
          <button className="primary" onClick={send} disabled={!input.trim() || thinking}>
            {t.interview.send}
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
            title={
              !mic.supported
                ? t.interview.micUnsupported
                : mic.listening
                  ? t.interview.finishAndSend
                  : t.interview.answerBySpeaking
            }
          >
            {mic.listening ? <MicIcon /> : <MicOffIcon />}
            <span>{mic.listening ? t.interview.finishAnswer : t.interview.answer}</span>
          </button>
          <button
            className={`control ${keyboard ? 'active' : ''}`}
            onClick={() => setKeyboard(!keyboard)}
            aria-pressed={keyboard}
            title={t.interview.typeAnswer}
            aria-label={t.interview.typeAnswer}
          >
            <KeyboardIcon />
          </button>
          <button
            className={`control ${captions ? 'active' : ''}`}
            onClick={() => setCaptions(!captions)}
            aria-pressed={captions}
            title={t.interview.captions}
            aria-label={t.interview.captions}
          >
            <CaptionsIcon />
          </button>
          <button
            className={`control ${transcriptOpen ? 'active' : ''}`}
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            aria-pressed={transcriptOpen}
            title={t.interview.transcript}
            aria-label={t.interview.transcript}
          >
            <TranscriptIcon />
          </button>
          <button
            className={`control ${muted ? 'off' : ''}`}
            onClick={toggleMute}
            aria-pressed={muted}
            title={muted ? t.interview.unmute : t.interview.mute}
            aria-label={muted ? t.interview.unmute : t.interview.mute}
          >
            {muted ? <MutedIcon /> : <VolumeIcon />}
          </button>
        </div>
        <button className="control hangup" onClick={end} title={t.interview.endTitle} aria-label={t.interview.endTitle}>
          <HangUpIcon />
          <span>{t.interview.end}</span>
        </button>
      </footer>
      <p className="hint call-hint">{mic.supported ? t.interview.hintMic : t.interview.hintNoMic}</p>
    </main>
  );
}
