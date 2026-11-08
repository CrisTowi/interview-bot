import { useEffect, useMemo, useState } from 'react';
import { fetchOpenRouterModels, interviewCostLabel, priceLabel, type ModelOption } from '../lib/openrouter';
import { useT } from '../i18n';
import { ChevronIcon } from './icons';
import { focusOnMount } from './ui';

type Filter = 'all' | 'free' | 'paid' | 'agent';

/** Searchable list of OpenRouter models with prices; falls back to a text field if the catalog can't load. */
export function ModelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const t = useT();
  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: t.models.all },
    { value: 'free', label: t.models.free },
    { value: 'paid', label: t.models.paid },
    { value: 'agent', label: t.models.agentFilter },
  ];

  useEffect(() => {
    fetchOpenRouterModels().then(setModels, () => setFailed(true));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (models ?? []).filter(
      (m) =>
        (filter === 'all' || (filter === 'agent' ? m.tools : (filter === 'free') === m.free)) &&
        (!q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)),
    );
  }, [models, query, filter]);

  if (failed) {
    return (
      <input
        aria-label={t.settings.model}
        placeholder={t.models.fallbackPlaceholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const selected = models?.find((m) => m.id === value);
  const cost = selected && interviewCostLabel(selected);

  return (
    <div className="model-picker">
      <button type="button" className="model-current" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="model-text">
          <span className="model-name">{selected?.name ?? (models ? value : t.models.loading)}</span>
          {selected && (
            <span className="model-price">
              {priceLabel(selected)}
              {cost && `, ${cost}`}
            </span>
          )}
        </span>
        <ChevronIcon />
      </button>

      {open && models && (
        <div className="model-panel">
          <input
            ref={focusOnMount}
            placeholder={t.models.search}
            aria-label={t.models.searchLabel}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="chips" role="radiogroup" aria-label={t.models.filterLabel}>
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={filter === f.value}
                className={filter === f.value ? 'chip active' : 'chip'}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <ul className="model-list" role="listbox" aria-label={t.models.listLabel}>
            {visible.map((m) => (
              <li key={m.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={m.id === value}
                  className={m.id === value ? 'model-row selected' : 'model-row'}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                >
                  <span className="model-name">{m.name}</span>
                  <span className={m.free ? 'model-price free' : 'model-price'}>
                    {priceLabel(m)}
                    {m.tools && (
                      <span className="agent-tag" title={t.models.agentTagTitle}>
                        {t.models.agentTag}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {visible.length === 0 && (
            <p className="hint" role="status">
              {t.models.none}
            </p>
          )}
          <p className="hint">{t.models.note}</p>
        </div>
      )}
    </div>
  );
}
