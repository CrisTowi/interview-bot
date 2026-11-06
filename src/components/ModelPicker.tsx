import { useEffect, useMemo, useState } from 'react';
import { fetchOpenRouterModels, interviewCostLabel, priceLabel, type ModelOption } from '../lib/openrouter';
import { ChevronIcon } from './icons';

type Filter = 'all' | 'free' | 'paid';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'free', label: 'Gratis' },
  { value: 'paid', label: 'De pago' },
];

/** Searchable list of OpenRouter models with prices; falls back to a text field if the catalog can't load. */
export function ModelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    fetchOpenRouterModels().then(setModels, () => setFailed(true));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (models ?? []).filter(
      (m) =>
        (filter === 'all' || (filter === 'free') === m.free) &&
        (!q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)),
    );
  }, [models, query, filter]);

  if (failed) {
    return <input aria-label="Modelo" placeholder="Modelo (ej. anthropic/claude-sonnet-5.5)" value={value} onChange={(e) => onChange(e.target.value)} />;
  }

  const selected = models?.find((m) => m.id === value);
  const cost = selected && interviewCostLabel(selected);

  return (
    <div className="model-picker">
      <button type="button" className="model-current" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="model-text">
          <span className="model-name">{selected?.name ?? (models ? value : 'Cargando modelos…')}</span>
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
          <input autoFocus placeholder="Buscar modelo…" aria-label="Buscar modelo" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="chips" role="radiogroup" aria-label="Filtrar por precio">
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
          <ul className="model-list" role="listbox" aria-label="Modelos">
            {visible.map((m) => (
              <li key={m.id}>
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
                  <span className={m.free ? 'model-price free' : 'model-price'}>{priceLabel(m)}</span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="hint">Ningún modelo coincide.</li>}
          </ul>
          <p className="hint">
            Los modelos gratis tienen límites de uso y algunos pueden usar tus conversaciones para entrenar. Precios: entrada / salida.
          </p>
        </div>
      )}
    </div>
  );
}
