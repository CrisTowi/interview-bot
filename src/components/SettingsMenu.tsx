import { useEffect, useRef } from 'react';
import { DEFAULT_MODELS, DEFAULT_VOICES, useApp } from '../store';
import type { CloudProvider, Lang, TtsProvider } from '../types';
import { ChevronIcon } from './icons';
import { Select, useLocalAiStatus } from './ui';

type EngineChoice = 'local' | CloudProvider;
type VoiceChoice = 'native' | 'off' | TtsProvider;

const ENGINES = [
  { value: 'local' as EngineChoice, label: 'Chrome AI (local, gratis)' },
  { value: 'openai' as EngineChoice, label: 'OpenAI (tu API key)' },
  { value: 'anthropic' as EngineChoice, label: 'Anthropic (tu API key)' },
  { value: 'gemini' as EngineChoice, label: 'Gemini (tu API key)' },
];
const VOICES = [
  { value: 'native' as VoiceChoice, label: 'Voz del navegador' },
  { value: 'openai' as VoiceChoice, label: 'OpenAI TTS (tu API key)' },
  { value: 'elevenlabs' as VoiceChoice, label: 'ElevenLabs (tu API key)' },
  { value: 'off' as VoiceChoice, label: 'Sin voz' },
];
const LANGS = [
  { value: 'es' as Lang, label: 'Español' },
  { value: 'en' as Lang, label: 'English' },
];
const KEY_LINKS: Record<CloudProvider | TtsProvider, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
  elevenlabs: 'https://elevenlabs.io/app/settings/api-keys',
};
const LOCAL_STATUS_TEXT = {
  checking: 'Comprobando disponibilidad…',
  available: 'Listo. Corre en tu equipo; nada sale de tu navegador.',
  downloadable: 'Se descargará el modelo (~2 GB) al empezar la primera entrevista.',
  downloading: 'Descargando el modelo…',
  unavailable: 'No disponible aquí. Activa chrome://flags/#prompt-api-for-gemini-nano o elige un proveedor con API key.',
};

interface Props {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function SettingsMenu({ open, onToggle, onClose }: Props) {
  const { settings, setSettings, profile, setProfile, history, clearHistory } = useApp();
  const localStatus = useLocalAiStatus();
  const container = useRef<HTMLDivElement>(null);
  const { cloud, premiumTts } = settings;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!container.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const engine: EngineChoice = settings.llm === 'local' ? 'local' : cloud.provider;
  const voice: VoiceChoice = settings.tts === 'premium' ? premiumTts.provider : settings.tts;

  function chooseEngine(choice: EngineChoice) {
    if (choice === 'local') return setSettings({ llm: 'local' });
    const model = choice === cloud.provider ? cloud.model : DEFAULT_MODELS[choice];
    setSettings({ llm: 'cloud', cloud: { ...cloud, provider: choice, model } });
  }

  function chooseVoice(choice: VoiceChoice) {
    if (choice === 'native' || choice === 'off') return setSettings({ tts: choice });
    const voiceId = choice === premiumTts.provider ? premiumTts.voice : DEFAULT_VOICES[choice];
    setSettings({ tts: 'premium', premiumTts: { ...premiumTts, provider: choice, voice: voiceId } });
  }

  return (
    <div className="menu-anchor" ref={container}>
      <button className="ghost" aria-expanded={open} aria-haspopup="dialog" onClick={onToggle}>
        Ajustes <ChevronIcon />
      </button>

      {open && (
        <div className="menu" role="dialog" aria-label="Ajustes">
          <div className="menu-group">
            <span className="menu-label">Motor de IA</span>
            <Select value={engine} options={ENGINES} onChange={chooseEngine} />
            {settings.llm === 'local' ? (
              <p className="hint">{LOCAL_STATUS_TEXT[localStatus]}</p>
            ) : (
              <>
                <input
                  type="password"
                  autoComplete="off"
                  aria-label="API key"
                  placeholder="API key"
                  value={cloud.apiKey}
                  onChange={(e) => setSettings({ cloud: { ...cloud, apiKey: e.target.value } })}
                />
                <input
                  aria-label="Modelo"
                  placeholder="Modelo"
                  value={cloud.model}
                  onChange={(e) => setSettings({ cloud: { ...cloud, model: e.target.value } })}
                />
                <p className="hint">
                  Se guarda solo en este navegador.{' '}
                  <a href={KEY_LINKS[cloud.provider]} target="_blank" rel="noreferrer">
                    Obtener una key
                  </a>
                </p>
              </>
            )}
          </div>

          <div className="menu-group">
            <span className="menu-label">Voz del entrevistador</span>
            <Select value={voice} options={VOICES} onChange={chooseVoice} />
            {settings.tts === 'premium' && (
              <>
                <input
                  type="password"
                  autoComplete="off"
                  aria-label="API key de voz"
                  placeholder="API key"
                  value={premiumTts.apiKey}
                  onChange={(e) => setSettings({ premiumTts: { ...premiumTts, apiKey: e.target.value } })}
                />
                <input
                  aria-label="Voz"
                  placeholder={premiumTts.provider === 'openai' ? 'Voz (alloy, nova, onyx…)' : 'Voice ID'}
                  value={premiumTts.voice}
                  onChange={(e) => setSettings({ premiumTts: { ...premiumTts, voice: e.target.value } })}
                />
              </>
            )}
          </div>

          <div className="menu-group">
            <span className="menu-label">Idioma de la entrevista</span>
            <Select value={profile.lang} options={LANGS} onChange={(lang) => setProfile({ lang })} />
          </div>

          <div className="menu-footer">
            <button
              className="link"
              disabled={!history.length}
              onClick={() => confirm('¿Borrar todo el historial de entrevistas?') && clearHistory()}
            >
              Borrar historial
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
