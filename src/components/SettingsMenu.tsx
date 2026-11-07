import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { DEFAULT_MODELS, DEFAULT_VOICES, useApp } from '../store';
import type { CloudProvider, Lang, TtsProvider } from '../types';
import { Dropdown } from './Dropdown';
import { ModelPicker } from './ModelPicker';
import { SyncSection, useSyncOverview } from './SyncSection';
import { Select, useLocalAiStatus, useMediaQuery } from './ui';

type EngineChoice = 'local' | CloudProvider;
type VoiceChoice = 'native' | 'off' | TtsProvider;

// Endonyms: each language is named in itself, whatever the app language.
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
interface Props {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}

type Section = 'engine' | 'voice' | 'sync';

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
  active,
  onOpen,
}: {
  title: string;
  value: string;
  tone?: string;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? 'overview-row active' : 'overview-row'}
      aria-expanded={active}
      onClick={onOpen}
    >
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
 * Settings in two levels: an overview of three rows that already show their current values, and the
 * chosen section in a floating panel beside it (inline under its row on narrow screens).
 */
export function SettingsMenu({ open, onToggle, onClose }: Props) {
  const { settings, setSettings, profile, setProfile } = useApp();
  const t = useT();
  const SECTION_TITLES: Record<Section, string> = t.settings.sections;
  const ENGINES: { value: EngineChoice; label: string }[] = [
    { value: 'local', label: t.settings.engineLocal },
    ...(['openai', 'anthropic', 'gemini', 'openrouter'] as const).map((p) => ({
      value: p,
      label: t.common.withYourKey(PROVIDER_LABELS[p]),
    })),
  ];
  const VOICES: { value: VoiceChoice; label: string }[] = [
    { value: 'native', label: t.settings.voiceBrowser },
    { value: 'openai', label: t.common.withYourKey('OpenAI TTS') },
    { value: 'elevenlabs', label: t.common.withYourKey('ElevenLabs') },
    { value: 'off', label: t.settings.voiceOff },
  ];
  const localStatus = useLocalAiStatus();
  const sync = useSyncOverview();
  const [section, setSection] = useState<Section | null>(null);
  // The side panel needs room to the left of the menu; on narrow screens sections open inline.
  const wide = useMediaQuery('(min-width: 760px)');
  const { cloud, premiumTts } = settings;

  // Every time the menu opens, start with just the overview.
  useEffect(() => {
    if (open) setSection(null);
  }, [open]);

  const toggleSection = (next: Section) => setSection((current) => (current === next ? null : next));

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
        ? { value: t.settings.engineSummaryLocalUnavailable, tone: 'warn' }
        : { value: t.settings.engineSummaryLocal, tone: 'ok' };
  } else if (!cloud.apiKey.trim()) {
    engineSummary = { value: t.settings.engineSummaryMissingKey(PROVIDER_LABELS[cloud.provider]), tone: 'warn' };
  } else {
    engineSummary = { value: `${PROVIDER_LABELS[cloud.provider]}, ${cloud.model.split('/').pop()}`, tone: 'ok' };
  }
  const langLabel = LANGS.find((l) => l.value === profile.lang)?.label ?? '';
  // Same dot convention as the other rows: green when ready, amber when a key is missing, none when off.
  const premiumName = premiumTts.provider === 'openai' ? 'OpenAI TTS' : 'ElevenLabs';
  let voiceSummary: { value: string; tone?: string };
  if (settings.tts === 'native')
    voiceSummary = { value: `${t.settings.voiceSummaryBrowser}, ${langLabel}`, tone: 'ok' };
  else if (settings.tts === 'off') voiceSummary = { value: `${t.settings.voiceOff}, ${langLabel}` };
  else if (!premiumTts.apiKey.trim())
    voiceSummary = { value: t.settings.voiceSummaryMissingKey(premiumName), tone: 'warn' };
  else voiceSummary = { value: `${premiumName}, ${langLabel}`, tone: 'ok' };

  let content: ReactNode = null;
  if (section === 'engine') {
    content = (
      <div className="menu-group">
        <Select value={engine} options={ENGINES} onChange={chooseEngine} label={SECTION_TITLES.engine} />
        {settings.llm === 'local' ? (
          <p className="hint">{t.settings.localStatus[localStatus]}</p>
        ) : (
          <>
            <input
              type="password"
              autoComplete="off"
              aria-label={t.settings.apiKey}
              placeholder={t.settings.apiKey}
              value={cloud.apiKey}
              onChange={(e) => setSettings({ cloud: { ...cloud, apiKey: e.target.value } })}
            />
            {cloud.provider === 'openrouter' ? (
              <ModelPicker value={cloud.model} onChange={(model) => setSettings({ cloud: { ...cloud, model } })} />
            ) : (
              <input
                aria-label={t.settings.model}
                placeholder={t.settings.model}
                value={cloud.model}
                onChange={(e) => setSettings({ cloud: { ...cloud, model: e.target.value } })}
              />
            )}
            <p className="hint">
              {t.settings.keyHint}{' '}
              <a href={KEY_LINKS[cloud.provider]} target="_blank" rel="noreferrer">
                {t.settings.getKey}
              </a>
            </p>
          </>
        )}
      </div>
    );
  } else if (section === 'voice') {
    content = (
      <>
        <div className="menu-group">
          <span className="menu-label">{t.settings.interviewerVoice}</span>
          <Select value={voice} options={VOICES} onChange={chooseVoice} label={t.settings.interviewerVoice} />
          {settings.tts === 'premium' && (
            <>
              <input
                type="password"
                autoComplete="off"
                aria-label={t.settings.voiceKey}
                placeholder={t.settings.apiKey}
                value={premiumTts.apiKey}
                onChange={(e) => setSettings({ premiumTts: { ...premiumTts, apiKey: e.target.value } })}
              />
              <input
                aria-label={t.settings.voice}
                placeholder={premiumTts.provider === 'openai' ? t.settings.openaiVoicePlaceholder : t.settings.voiceId}
                value={premiumTts.voice}
                onChange={(e) => setSettings({ premiumTts: { ...premiumTts, voice: e.target.value } })}
              />
            </>
          )}
        </div>
        <div className="menu-group">
          <span className="menu-label">{t.settings.interviewLang}</span>
          <Select
            value={profile.lang}
            options={LANGS}
            onChange={(lang) => setProfile({ lang })}
            label={t.settings.interviewLang}
          />
        </div>
      </>
    );
  } else if (section === 'sync') {
    content = <SyncSection />;
  }

  const rows: { id: Section; title: string; value: string; tone?: string }[] = [
    { id: 'engine', title: SECTION_TITLES.engine, value: engineSummary.value, tone: engineSummary.tone },
    { id: 'voice', title: SECTION_TITLES.voice, value: voiceSummary.value, tone: voiceSummary.tone },
    { id: 'sync', title: SECTION_TITLES.sync, value: sync.summary.text, tone: sync.summary.tone },
  ];

  return (
    <Dropdown
      label={
        <>
          {sync.needsAttention && <span className="dot warn" aria-label={t.topbar.needsAttention} />}
          {t.topbar.settings}
        </>
      }
      title={t.topbar.settings}
      open={open}
      onToggle={onToggle}
      onClose={onClose}
      aside={
        wide &&
        section && (
          <div className="flyout" role="dialog" aria-label={SECTION_TITLES[section]}>
            <div className="flyout-head">
              <h3>{SECTION_TITLES[section]}</h3>
              <button className="icon-btn" onClick={() => setSection(null)} aria-label={t.common.close}>
                ✕
              </button>
            </div>
            {content}
          </div>
        )
      }
    >
      {rows.map((row) => (
        <div key={row.id}>
          <OverviewRow
            title={row.title}
            value={row.value}
            tone={row.tone}
            active={section === row.id}
            onOpen={() => toggleSection(row.id)}
          />
          {!wide && section === row.id && <div className="inline-section">{content}</div>}
        </div>
      ))}
    </Dropdown>
  );
}
