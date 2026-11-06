import { useEffect, useState } from 'react';
import { DEFAULT_MODELS, DEFAULT_VOICES, useApp } from '../store';
import type { CloudProvider, Lang, TtsProvider } from '../types';
import { Dropdown } from './Dropdown';
import { ModelPicker } from './ModelPicker';
import { SyncSection, useSyncOverview } from './SyncSection';
import { Select, useLocalAiStatus } from './ui';

type EngineChoice = 'local' | CloudProvider;
type VoiceChoice = 'native' | 'off' | TtsProvider;

const ENGINES = [
  { value: 'local' as EngineChoice, label: 'Chrome AI (local, gratis)' },
  { value: 'openai' as EngineChoice, label: 'OpenAI (tu API key)' },
  { value: 'anthropic' as EngineChoice, label: 'Anthropic (tu API key)' },
  { value: 'gemini' as EngineChoice, label: 'Gemini (tu API key)' },
  { value: 'openrouter' as EngineChoice, label: 'OpenRouter (tu API key)' },
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
  openrouter: 'https://openrouter.ai/settings/keys',
  elevenlabs: 'https://elevenlabs.io/app/settings/api-keys',
};
const LOCAL_STATUS_TEXT = {
  checking: 'Comprobando disponibilidad…',
  available: 'Listo. Corre en tu equipo; nada sale de tu navegador.',
  downloadable: 'Se descargará el modelo (~2 GB) al empezar la primera entrevista.',
  downloading: 'Descargando el modelo…',
  unavailable:
    'No disponible aquí. Activa chrome://flags/#prompt-api-for-gemini-nano o elige un proveedor con API key.',
};

interface Props {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}

type View = 'overview' | 'engine' | 'voice' | 'sync';

const VIEW_TITLES: Record<Exclude<View, 'overview'>, string> = {
  engine: 'Motor de IA',
  voice: 'Voz e idioma',
  sync: 'Sincronización',
};

const PROVIDER_LABELS: Record<CloudProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
};

/** One overview row: what the section is, its current value, and a way in. */
function OverviewRow({
  title,
  value,
  tone,
  onOpen,
}: {
  title: string;
  value: string;
  tone?: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="overview-row" onClick={onOpen}>
      <span className="overview-text">
        <span className="overview-title">{title}</span>
        <span className="overview-value">
          {tone !== undefined && <span className={`dot ${tone}`} />}
          {value}
        </span>
      </span>
      <svg className="overview-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M9 6l6 6-6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * Settings in two levels: an overview of three rows that already show their current values, and one
 * focused view per section, so the panel never shows every option at once.
 */
export function SettingsMenu({ open, onToggle, onClose }: Props) {
  const { settings, setSettings, profile, setProfile, history, clearHistory } = useApp();
  const localStatus = useLocalAiStatus();
  const sync = useSyncOverview();
  const [view, setView] = useState<View>('overview');
  const { cloud, premiumTts } = settings;

  // Every time the panel opens, start from the overview.
  useEffect(() => {
    if (open) setView('overview');
  }, [open]);

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

  let engineSummary: { value: string; tone: string };
  if (settings.llm === 'local') {
    engineSummary =
      localStatus === 'unavailable'
        ? { value: 'Chrome AI no está disponible aquí', tone: 'warn' }
        : { value: 'Chrome AI, en tu equipo', tone: 'ok' };
  } else if (!cloud.apiKey.trim()) {
    engineSummary = { value: `${PROVIDER_LABELS[cloud.provider]}: falta tu API key`, tone: 'warn' };
  } else {
    engineSummary = { value: `${PROVIDER_LABELS[cloud.provider]}, ${cloud.model.split('/').pop()}`, tone: 'ok' };
  }
  const voiceLabel = VOICES.find((v) => v.value === voice)?.label ?? '';
  const langLabel = LANGS.find((l) => l.value === profile.lang)?.label ?? '';

  return (
    <Dropdown
      label={
        <>
          {sync.needsAttention && <span className="dot warn" aria-label="Requiere tu atención" />}
          Ajustes
        </>
      }
      title="Ajustes"
      open={open}
      onToggle={onToggle}
      onClose={onClose}
    >
      {view === 'overview' ? (
        <>
          <OverviewRow
            title="Motor de IA"
            value={engineSummary.value}
            tone={engineSummary.tone}
            onOpen={() => setView('engine')}
          />
          <OverviewRow title="Voz e idioma" value={`${voiceLabel}, ${langLabel}`} onOpen={() => setView('voice')} />
          <OverviewRow
            title="Sincronización"
            value={sync.summary.text}
            tone={sync.summary.tone}
            onOpen={() => setView('sync')}
          />
          <div className="menu-footer">
            <button
              className="link"
              disabled={!history.length}
              onClick={() => confirm('¿Borrar todo el historial de entrevistas?') && clearHistory()}
            >
              Borrar historial
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="view-head">
            <button type="button" className="link back" onClick={() => setView('overview')}>
              ‹ Ajustes
            </button>
            <h3>{VIEW_TITLES[view]}</h3>
          </div>

          {view === 'engine' && (
            <div className="menu-group">
              <Select value={engine} options={ENGINES} onChange={chooseEngine} label="Motor de IA" />
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
                  {cloud.provider === 'openrouter' ? (
                    <ModelPicker
                      value={cloud.model}
                      onChange={(model) => setSettings({ cloud: { ...cloud, model } })}
                    />
                  ) : (
                    <input
                      aria-label="Modelo"
                      placeholder="Modelo"
                      value={cloud.model}
                      onChange={(e) => setSettings({ cloud: { ...cloud, model: e.target.value } })}
                    />
                  )}
                  <p className="hint">
                    Se guarda en este navegador; solo se sincroniza si lo activas en Sincronización.{' '}
                    <a href={KEY_LINKS[cloud.provider]} target="_blank" rel="noreferrer">
                      Obtener una key
                    </a>
                  </p>
                </>
              )}
            </div>
          )}

          {view === 'voice' && (
            <>
              <div className="menu-group">
                <span className="menu-label">Voz del entrevistador</span>
                <Select value={voice} options={VOICES} onChange={chooseVoice} label="Voz del entrevistador" />
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
                <Select value={profile.lang} options={LANGS} onChange={(lang) => setProfile({ lang })} label="Idioma" />
              </div>
            </>
          )}

          {view === 'sync' && <SyncSection />}
        </>
      )}
    </Dropdown>
  );
}
