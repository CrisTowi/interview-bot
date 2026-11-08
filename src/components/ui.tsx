import { useEffect, useState } from 'react';
import { supportsTools } from '../engines/agent';
import { checkLocalAi, type LocalAiStatus } from '../engines/localAgent';
import { useApp } from '../store';

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <span className="select">
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

export function useLocalAiStatus(): LocalAiStatus {
  const [status, setStatus] = useState<LocalAiStatus>('checking');
  useEffect(() => {
    checkLocalAi().then(setStatus);
  }, []);
  return status;
}

/** Whether the selected LLM engine can run an interview right now. */
export function useEngineReady(): { ready: boolean; localStatus: LocalAiStatus } {
  const settings = useApp((s) => s.settings);
  const localStatus = useLocalAiStatus();
  const ready =
    settings.llm === 'local'
      ? ['available', 'downloadable', 'downloading'].includes(localStatus)
      : settings.cloud.apiKey.trim() !== '' && settings.cloud.model.trim() !== '';
  return { ready, localStatus };
}

export function ScoreBadge({ score }: { score: number }) {
  if (!score) return null;
  const tone = score >= 7 ? 'good' : score >= 5 ? 'mid' : 'low';
  return <span className={`score ${tone}`}>{score}/10</span>;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Agent mode availability for the selected engine/model: null while checking. */
export function useToolSupport(): boolean | null {
  const settings = useApp((s) => s.settings);
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    setSupported(null);
    supportsTools(settings).then((value) => current && setSupported(value));
    return () => {
      current = false;
    };
    // Only these fields change the answer; re-checking on every settings edit (e.g. typing a key) would flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.llm, settings.cloud.provider, settings.cloud.model]);
  return supported;
}

/**
 * Moves focus to a field the user just opened (search box, text area). Stable identity, so React calls it
 * only when the element mounts — unlike an inline arrow, which would refocus on every render.
 */
export const focusOnMount = (el: HTMLElement | null) => el?.focus();
