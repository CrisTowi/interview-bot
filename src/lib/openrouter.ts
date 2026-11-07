import { t } from '../i18n';

/**
 * OpenRouter's public model catalog. It needs no API key and allows CORS, so the browser fetches it directly.
 */

export interface ModelOption {
  id: string;
  name: string;
  free: boolean;
  /** USD per million tokens; negative means the price varies (e.g. the auto router). */
  inputPerM: number;
  outputPerM: number;
}

// Rough size of one interview: ~10 exchanges whose context grows each turn, plus the final evaluation.
const INTERVIEW_INPUT_TOKENS = 60_000;
const INTERVIEW_OUTPUT_TOKENS = 3_000;

let catalog: Promise<ModelOption[]> | null = null;

export function fetchOpenRouterModels(): Promise<ModelOption[]> {
  catalog ??= fetch('https://openrouter.ai/api/v1/models')
    .then((res) => {
      if (!res.ok) throw new Error(`OpenRouter: HTTP ${res.status}`);
      return res.json();
    })
    .then(({ data }: { data: any[] }) =>
      data
        // Text-only output: media models (music, images) list $0 per token but charge per item.
        .filter((m) => !m.id.endsWith(':batch') && m.architecture?.output_modalities?.join() === 'text')
        .map((m): ModelOption => {
          const inputPerM = Number(m.pricing?.prompt) * 1e6;
          const outputPerM = Number(m.pricing?.completion) * 1e6;
          return { id: m.id, name: m.name ?? m.id, free: inputPerM === 0 && outputPerM === 0, inputPerM, outputPerM };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  // Let a later call retry if this one failed.
  catalog.catch(() => (catalog = null));
  return catalog;
}

function usd(amount: number): string {
  if (amount === 0) return '$0';
  if (amount < 0.01) return '<$0.01';
  return `$${amount < 10 ? amount.toFixed(2) : amount.toFixed(0)}`;
}

export function priceLabel(m: ModelOption): string {
  if (m.free) return t().models.free;
  if (m.inputPerM < 0 || m.outputPerM < 0) return t().models.priceVariable;
  return t().models.perMillion(usd(m.inputPerM), usd(m.outputPerM));
}

export function interviewCostLabel(m: ModelOption): string | null {
  if (m.free || m.inputPerM < 0 || m.outputPerM < 0) return null;
  const cost = (m.inputPerM * INTERVIEW_INPUT_TOKENS + m.outputPerM * INTERVIEW_OUTPUT_TOKENS) / 1e6;
  return t().models.perInterview(usd(cost));
}
