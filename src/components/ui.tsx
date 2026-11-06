import { useEffect, useState } from 'react';
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
